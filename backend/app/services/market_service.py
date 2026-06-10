from datetime import datetime, timezone, timedelta

from app.clients import upbit_rest
from app.core import config
from app.core.cache import cached
from app.schemas.market import Orderbook, OrderbookUnit, MarketSummary, Ticker, Trade

_KST = timezone(timedelta(hours=9))  # 업비트 52주 고/저 달성일은 KST 기준


def _korean_names() -> dict[str, str]:
    """전체 마켓의 market→korean_name 매핑 (장시간 캐시)."""
    return cached(
        "market_all",
        config.TTL_MARKET_ALL,
        lambda: {m["market"]: m["korean_name"] for m in upbit_rest.get_market_all()},
    )


def valid_markets() -> list[str]:
    """분석 대상 마켓 목록 (실제 상장된 것만).
    USE_ALL_KRW_MARKETS면 업비트 KRW 마켓 전체, 아니면 설정한 15종목.
    /market/all(장시간 캐시)과 교집합이라 상폐 코드(예: KRW-DRIFT)는 자동 제외된다."""
    names = _korean_names()
    if config.USE_ALL_KRW_MARKETS:
        return [m for m in names if m.startswith("KRW-")]
    return [m for m in config.MARKETS if m in names]


# 스파크라인(1시간봉 24개) — 코인목록 전체 행이 쓰므로 전 종목 채운다. 부팅 프리페치에서 1회 워밍하고
# TTL을 길게(30분) 둬, 사용자 네비게이션은 캐시 히트로 비용 0이고 백그라운드 재페치 빈도도 낮다.
# (과거엔 상위 30만 채웠으나, 코인목록에 전 종목 미니 스파크라인을 그리려면 전부 필요)
_SPARK_LIMIT = 10_000   # 사실상 전 종목


def _sparkline(market: str) -> list[float]:
    """최근 24시간 1시간봉 종가 — 코인목록 '1일' 미니 그래프용 (가벼운 별도 캐시)."""
    raw = cached(
        f"spark:{market}",
        config.TTL_SPARKLINE,
        lambda: upbit_rest.get_candles("minutes/60", market, 24),
    )
    closes = [c["trade_price"] for c in reversed(raw)]  # 최신순 → 오래된순
    return closes or [0.0]


def _build_tickers() -> list[Ticker]:
    markets = valid_markets()
    if not markets:
        return []
    names = _korean_names()
    raw = upbit_rest.get_tickers(markets)

    # "오늘 52주 고/저 경신" 판정 기준일(KST). 현재가가 고/저를 정확히 일치하는
    # 순간은 거의 없어, 업비트가 주는 달성일(highest/lowest_52_week_date)로 판정한다.
    today_kst = datetime.now(_KST).strftime("%Y-%m-%d")

    result: list[Ticker] = []
    for r in raw:
        m = r["market"]
        price = r["trade_price"]
        w52_high = r.get("highest_52_week_price", 0.0) or 0.0
        w52_low = r.get("lowest_52_week_price", 0.0) or 0.0
        result.append(Ticker(
            market=m,
            korean_name=names.get(m, m),
            trade_price=price,
            change=r["change"],
            change_rate=r["signed_change_rate"],
            change_price=r["change_price"],
            acc_trade_price_24h=r["acc_trade_price_24h"],
            high_price=r["high_price"],
            low_price=r["low_price"],
            prev_closing_price=r["prev_closing_price"],
            sparkline=[],  # 아래에서 거래대금 상위 N종만 채움(팬아웃 절감)
            is_52w_high=r.get("highest_52_week_date") == today_kst,
            is_52w_low=r.get("lowest_52_week_date") == today_kst,
            w52_high=w52_high,
            w52_low=w52_low,
        ))
    # 거래대금(24h) 내림차순 — 코인목록·비교·스크리너의 기본 노출 순서(인기 종목 우선)
    result.sort(key=lambda t: t.acc_trade_price_24h, reverse=True)
    # 스파크라인은 상위 종목만(시각 요소). 정렬 후라야 거래대금 상위를 알 수 있다.
    for t in result[:_SPARK_LIMIT]:
        t.sparkline = _sparkline(t.market)
    return result


def get_tickers() -> list[Ticker]:
    # 조립된 Ticker 리스트 전체를 캐시한다. 과거엔 raw 업비트 응답만 캐시하고 매 호출마다 261개
    # 객체 변환·정렬·스파크라인 주입을 반복했는데, get_tickers는 여러 라우터가 내부적으로
    # 자주 호출(coin_stats·trends·signals·brief 등)하므로 그 CPU가 낭비였다. SWR 캐시라 만료돼도
    # 즉시 옛 리스트 반환 + 백그라운드 1회 재조립. (호출부는 반환 리스트를 변형하지 않음)
    return cached("tickers_assembled", config.TTL_TICKER, _build_tickers)


def get_ticker(market: str) -> Ticker | None:
    return next((t for t in get_tickers() if t.market == market), None)


def get_market_summary() -> MarketSummary:
    from app.services import marketcap_service  # 지연 import(순환 방지)
    tickers = get_tickers()
    up = sum(1 for t in tickers if t.change == "RISE")
    down = sum(1 for t in tickers if t.change == "FALL")
    total = sum(t.acc_trade_price_24h for t in tickers)
    # 도미넌스는 시총 기준(CoinGecko /global)을 우선, 외부 실패 시 거래대금 비중으로 폴백.
    glob = marketcap_service.get_global()
    if glob.get("btc_dominance"):
        dom = float(glob["btc_dominance"])
    else:
        btc = next((t for t in tickers if t.market == "KRW-BTC"), None)
        dom = (btc.acc_trade_price_24h / total * 100) if btc and total else 0
    return MarketSummary(
        total_volume=round(total),
        up_count=up,
        down_count=down,
        btc_dominance=round(dom, 1),
    )


def get_orderbook(market: str) -> Orderbook | None:
    ob = cached(
        f"orderbook:{market}",
        config.TTL_ORDERBOOK,
        lambda: upbit_rest.get_orderbook(market),
    )
    if not ob:
        return None
    units = ob.get("orderbook_units", [])
    return Orderbook(
        market=market,
        asks=[OrderbookUnit(price=u["ask_price"], size=u["ask_size"]) for u in units],
        bids=[OrderbookUnit(price=u["bid_price"], size=u["bid_size"]) for u in units],
    )


def get_trades(market: str) -> list[Trade]:
    raw = cached(
        f"trades:{market}",
        config.TTL_TRADES,
        lambda: upbit_rest.get_trades(market, 30),
    )
    return [
        Trade(
            timestamp=int(t["timestamp"] // 1000),  # Upbit ms → 초 (프론트가 ×1000)
            price=t["trade_price"],
            volume=t["trade_volume"],
            side=t["ask_bid"],  # BID | ASK
        )
        for t in raw
    ]
