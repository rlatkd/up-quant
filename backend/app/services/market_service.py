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


# 스파크라인(1시간봉 24개)은 대시보드 시세표(상위 10)·마켓 상단 카드(상위 4)만 쓰는 시각 요소라,
# 거래대금 상위 N종만 채운다. 261종 전부 받으면 콜드/갱신마다 불필요한 팬아웃이 커진다.
_SPARK_LIMIT = 30


def _sparkline(market: str) -> list[float]:
    """최근 24시간 1시간봉 종가 — 코인목록 '1일' 미니 그래프용 (가벼운 별도 캐시)."""
    raw = cached(
        f"spark:{market}",
        config.TTL_SPARKLINE,
        lambda: upbit_rest.get_candles("minutes/60", market, 24),
    )
    closes = [c["trade_price"] for c in reversed(raw)]  # 최신순 → 오래된순
    return closes or [0.0]


def get_tickers() -> list[Ticker]:
    markets = valid_markets()
    if not markets:
        return []
    names = _korean_names()
    raw = cached(
        f"ticker:{','.join(markets)}",
        config.TTL_TICKER,
        lambda: upbit_rest.get_tickers(markets),
    )

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


def get_ticker(market: str) -> Ticker | None:
    return next((t for t in get_tickers() if t.market == market), None)


def get_market_summary() -> MarketSummary:
    tickers = get_tickers()
    up = sum(1 for t in tickers if t.change == "RISE")
    down = sum(1 for t in tickers if t.change == "FALL")
    total = sum(t.acc_trade_price_24h for t in tickers)
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
