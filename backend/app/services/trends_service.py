"""트렌드 대시보드 — 업비트 코인동향 미러. 자체 산출(업비트 시세) + 외부(환율·뉴스·시총).
- 시장 지수: 일봉 동일가중 + 60분봉 당일/전일 인트라데이.
- 자산 지수 표: 시장/전략/테마/섹터 그룹별 동일가중 지수(전일대비·1개월·3개월).
- 체결강도: WS 티커의 acc_ask/bid_volume로 매수/매도 우위 랭킹.
- 기간별 수익률: 일봉·월봉 + 외부 시총(CoinGecko).
- 시황: 자체 생성.
"""
import asyncio
import json
import ssl
from datetime import datetime, timezone, timedelta

import certifi
import numpy as np
import websockets

from app.core import config
from app.core.cache import cached
from app.schemas.trends import (
    AssetIndexRow,
    AssetIndices,
    IntradayPoint,
    MarketBrief,
    MarketIndex,
    PeriodReturnRow,
    PeriodReturns,
    TrendsIndices,
    VolumePower,
    VolumePowerItem,
)
from app.services import candle_service, market_service, marketcap_service

_KST = timezone(timedelta(hours=9))
_UPBIT_WS = "wss://api.upbit.com/websocket/v1"
_SSL_CTX = ssl.create_default_context(cafile=certifi.where())


def _name_map() -> dict[str, str]:
    return {t.market: t.korean_name for t in market_service.get_tickers()}


# ── 자체 시장 지수 (동일가중) + 당일/전일 인트라데이 ───────────
_IDX_CANDLES = 100
_IDX_MIN_LEN = 60
_SPARK_N = 40
_INTRA_CAP = 40       # 인트라데이 지수 구성 상한(60분봉 팬아웃 절감 — 대형 비중이라 형태 근사 충분)


def _equal_weight_index(markets: list[str]) -> tuple[np.ndarray, int]:
    from app.services import quant_service
    kept, closes = quant_service.closes_matrix(markets, count=_IDX_CANDLES, min_len=_IDX_MIN_LEN)
    if len(kept) < 1 or closes.size == 0:
        return np.empty(0), 0
    return (closes / closes[0]).mean(axis=1) * 100.0, len(kept)


def _intraday(markets: list[str]) -> tuple[list[IntradayPoint], list[IntradayPoint]]:
    """60분봉으로 당일·전일 동일가중 인트라데이 지수(그날 시가 대비 %). 구성은 상한(_INTRA_CAP)으로 제한."""
    series: list[list[tuple[datetime, float]]] = []
    for m in markets[:_INTRA_CAP]:
        cs = candle_service.get_candles(m, "minutes/60", 48)
        if len(cs) >= 2:
            series.append([(datetime.fromtimestamp(c.timestamp / 1000, tz=_KST), c.close) for c in cs])
    if not series:
        return [], []
    dates = sorted({dt.date() for s in series for dt, _ in s})
    today_d = dates[-1]
    prev_d = dates[-2] if len(dates) >= 2 else None

    def day_index(day) -> list[IntradayPoint]:
        if day is None:
            return []
        buckets: dict[int, list[float]] = {}
        for s in series:
            pts = [(dt, c) for dt, c in s if dt.date() == day and c > 0]
            if len(pts) < 2:
                continue
            base = pts[0][1]
            for dt, c in pts:
                buckets.setdefault(dt.hour, []).append(c / base)
        return [IntradayPoint(h=h, pct=round((sum(v) / len(v) - 1) * 100, 3))
                for h, v in sorted(buckets.items())]

    return day_index(today_d), day_index(prev_d)


def _index_card(key: str, label: str, markets: list[str]) -> MarketIndex:
    idx, n = _equal_weight_index(markets)
    if idx.size < 2:
        return MarketIndex(key=key, label=label, value=0.0, change_rate=0.0, spark=[], n=n)
    today, prev = _intraday(markets)
    return MarketIndex(
        key=key, label=label, value=round(float(idx[-1]), 2),
        change_rate=round(float(idx[-1] / idx[-2] - 1) if idx[-2] else 0.0, 4),
        spark=[round(float(v), 2) for v in idx[-_SPARK_N:]],
        today=today, prev=prev, n=n,
    )


def _compute_indices() -> TrendsIndices:
    tickers = market_service.get_tickers()
    all_m = [t.market for t in tickers]
    present = set(all_m)
    btc_group = [m for m in ("KRW-BTC", "KRW-BCH", "KRW-BSV") if m in present]
    eth_group = [m for m in ("KRW-ETH", "KRW-ETC") if m in present]
    cards = [
        _index_card("total", "종합 지수", all_m),
        _index_card("alt", "알트코인 지수", [m for m in all_m if m != "KRW-BTC"]),
        _index_card("btc", "비트코인 그룹", btc_group),
        _index_card("eth", "이더리움 그룹", eth_group),
        _index_card("top10", "상위 10 지수", all_m[:10]),
        _index_card("top30", "상위 30 지수", all_m[:30]),
    ]
    return TrendsIndices(indices=cards)


def get_indices() -> TrendsIndices:
    return cached("trends:indices", config.TTL_CANDLE_DAYS, _compute_indices)


# ── 디지털 자산 지수 표 (시장/전략/테마/섹터) ──────────────────
_ASSET_CANDLES = 120
_ASSET_MIN_LEN = 95     # 3개월(90일) 수익률을 내려면 공통 윈도우 ≥91 필요 → 히스토리 95일 미만 제외
_STABLECOINS = {"KRW-USDT", "KRW-USDC", "KRW-DAI", "KRW-BUSD", "KRW-TUSD"}


def _index_metrics(markets: list[str]) -> dict | None:
    """동일가중 지수 레벨(기준 100) + 전일대비·1개월·3개월 수익률."""
    from app.services import quant_service
    kept, closes = quant_service.closes_matrix(markets, count=_ASSET_CANDLES, min_len=_ASSET_MIN_LEN)
    if len(kept) < 1 or closes.size < 2:
        return None
    idx = (closes / closes[0]).mean(axis=1)   # factor(시작=1)

    def ret(n: int) -> float | None:
        j = len(idx) - 1 - n
        return round((idx[-1] / idx[j] - 1) * 100, 2) if j >= 0 and idx[j] else None

    return {"value": round(float(idx[-1]) * 100, 2), "d1": ret(1), "m1": ret(30), "m3": ret(90), "n": len(kept)}


# 테마(level2) 개요. 섹터(level1)는 config.CATEGORY_LIST.
_THEME_DESC = {
    "모놀리식 블록체인": "단일 레이어에서 실행·합의·데이터를 처리하는 블록체인",
    "모듈러 블록체인": "실행·합의·데이터 가용성을 분리한 모듈형 블록체인",
    "DePIN": "분산형 물리 인프라 네트워크 디지털 자산",
    "가상세계": "메타버스·게임 등 가상세계 기반 디지털 자산",
    "예치": "스테이킹·렌딩 등 예치형 디파이 디지털 자산",
    "밈": "인터넷 밈 기반 디지털 자산",
    "스테이블 코인 그룹": "법정화폐 등에 가치를 고정한 디지털 자산",
}
_SECTOR_DESC = {
    "스마트 컨트랙트 플랫폼": "스마트 컨트랙트를 지원하는 L1/L2 플랫폼",
    "인프라": "결제·오라클·네트워크 등 블록체인 인프라",
    "디파이": "탈중앙 금융(거래소·렌딩·파생) 디지털 자산",
    "문화/엔터테인먼트": "게임·콘텐츠·팬토큰 등 문화 디지털 자산",
    "밈": "인터넷 밈 기반 디지털 자산",
}


def _compute_asset_indices() -> AssetIndices:
    tickers = market_service.get_tickers()
    all_m = [t.market for t in tickers]
    cats1 = config.MARKET_CATEGORIES                       # market → level1
    subs = config.MARKET_SUBCATEGORIES                     # market → {level1,level2,level3}
    rows: list[AssetIndexRow] = []

    def add(key, label, desc, tab, markets):
        if len(markets) < 1:
            return
        m = _index_metrics(markets)
        if m:
            rows.append(AssetIndexRow(key=key, label=label, desc=desc, tab=tab,
                                      value=m["value"], d1=m["d1"], m1=m["m1"], m3=m["m3"], n=m["n"]))

    # 시장 지수
    add("total", "종합 지수", "업비트 KRW 마켓 전체 동일가중", "시장", all_m)
    add("alt", "알트코인 지수", "비트코인 제외 동일가중", "시장", [m for m in all_m if m != "KRW-BTC"])
    add("top10", "상위 10 지수", "거래대금 상위 10종 동일가중", "시장", all_m[:10])
    add("top30", "상위 30 지수", "거래대금 상위 30종 동일가중", "시장", all_m[:30])

    # 전략 지수 — 모멘텀 Top5(최근 1개월 수익률 상위)
    from app.services import analysis_service
    stats = analysis_service.get_coin_stats()
    mom5 = [s.market for s in sorted(stats, key=lambda s: s.return_1m, reverse=True)[:5]]
    add("mom5", "모멘텀 Top 5", "최근 1개월 수익률 상위 5종 동일가중", "전략", mom5)
    lowvol5 = [s.market for s in sorted([s for s in stats if s.volatility > 0], key=lambda s: s.volatility)[:5]]
    add("lowvol5", "저변동성 Top 5", "변동성 하위 5종 동일가중(방어형)", "전략", lowvol5)

    # 테마 지수 — level2 상위 분류 + 비트코인/이더리움 그룹
    by_l2: dict[str, list[str]] = {}
    for m, sub in subs.items():
        l2 = sub.get("level2")
        if l2:
            by_l2.setdefault(l2, []).append(m)
    for l2 in [k for k in _THEME_DESC if k in by_l2][:6]:
        add(f"theme:{l2}", l2, _THEME_DESC[l2], "테마", by_l2[l2])
    add("btcgroup", "비트코인 그룹", "비트코인과 제네시스를 공유하는 디지털 자산",
        "테마", [m for m in ("KRW-BTC", "KRW-BCH", "KRW-BSV") if m in set(all_m)])

    # 섹터 지수 — level1
    by_l1: dict[str, list[str]] = {}
    for m, c in cats1.items():
        by_l1.setdefault(c, []).append(m)
    for c in config.CATEGORY_LIST:
        if c in by_l1:
            add(f"sector:{c}", c, _SECTOR_DESC.get(c, "섹터 동일가중 지수"), "섹터", by_l1[c])

    return AssetIndices(rows=rows)


def get_asset_indices() -> AssetIndices:
    return cached("trends:asset_indices", config.TTL_CANDLE_DAYS, _compute_asset_indices)


# ── 체결 강도 (WS acc_ask/bid_volume) ──────────────────────────
_VP_LIQUIDITY_TOP = 120    # 유동성 상위 N종만 대상(저유동 잡코인 노이즈 제외)


async def _ws_collect() -> dict[str, tuple[float, float]]:
    """전 종목 WS 티커 스냅샷 1회 수집 → {market: (체결강도, 24h거래대금)}. 체결강도=매수/매도×100."""
    markets = market_service.valid_markets()
    req = json.dumps([{"ticket": "vp"}, {"type": "ticker", "codes": markets}])
    out: dict[str, tuple[float, float]] = {}
    async with websockets.connect(_UPBIT_WS, ssl=_SSL_CTX, max_size=None, ping_interval=None) as ws:
        await ws.send(req)
        target = len(markets)
        while len(out) < target:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
            except asyncio.TimeoutError:
                break
            d = json.loads(raw)
            code = d["code"]
            ask = d.get("acc_ask_volume") or 0.0
            bid = d.get("acc_bid_volume") or 0.0
            if code not in out and ask > 0:
                out[code] = (round(bid / ask * 100, 1), d.get("acc_trade_price_24h", 0.0) or 0.0)
    return out


def _compute_volume_power() -> VolumePower:
    from app.core import metrics
    try:
        data = asyncio.run(_ws_collect())
    except Exception as e:  # noqa: BLE001
        metrics.record_source("volume_power_ws", ok=False, error=str(e))
        return VolumePower(buy=[], sell=[], error=f"체결강도 WS 실패 — 소스 점검 필요 ({type(e).__name__})")
    if not data:
        metrics.record_source("volume_power_ws", ok=False, error="empty")
        return VolumePower(buy=[], sell=[], error="체결강도 데이터 없음 — 소스 점검 필요")
    metrics.record_source("volume_power_ws", ok=True)
    nmap = _name_map()
    # 유동성 상위만 대상(거래대금 desc), 스테이블코인은 체결강도 의미가 없어 제외
    ranked = sorted(data.items(), key=lambda kv: kv[1][1], reverse=True)[:_VP_LIQUIDITY_TOP]
    items = [(m, power) for m, (power, _vol) in ranked if m not in _STABLECOINS]

    def mk(lst):
        return [VolumePowerItem(market=m, korean_name=nmap.get(m, m), power=p) for m, p in lst]

    buy = mk(sorted(items, key=lambda x: x[1], reverse=True)[:5])    # 매수 우위(체결강도 높음)
    sell = mk(sorted(items, key=lambda x: x[1])[:5])                 # 매도 우위(체결강도 낮음)
    return VolumePower(buy=buy, sell=sell)


def get_volume_power() -> VolumePower:
    return cached("trends:volume_power", 60, _compute_volume_power)


# ── 기간별 수익률 표 (+ 외부 시총) ─────────────────────────────
def _compute_period_returns() -> PeriodReturns:
    tickers = market_service.get_tickers()
    caps = marketcap_service.get_caps()      # 심볼 대문자 → (시총, 순위)
    rows: list[PeriodReturnRow] = []
    for t in tickers:
        daily = candle_service.get_candles(t.market, "days", 200)
        closes = [c.close for c in daily]

        def ret(n: int) -> float | None:
            if len(closes) > n and closes[-1 - n]:
                return round((closes[-1] / closes[-1 - n] - 1) * 100, 2)
            return None

        monthly = candle_service.get_candles(t.market, "months", 61)
        mc = [c.close for c in monthly]
        if len(mc) >= 13 and mc[-13]:
            r1y = round((mc[-1] / mc[-13] - 1) * 100, 2)
        elif len(mc) >= 2 and mc[0]:
            r1y = round((mc[-1] / mc[0] - 1) * 100, 2)
        else:
            r1y = None

        sym = t.market.replace("KRW-", "")
        cap = caps.get(sym)
        rows.append(PeriodReturnRow(
            market=t.market, korean_name=t.korean_name,
            acc_trade_price_24h=t.acc_trade_price_24h,
            r1w=ret(7), r1m=ret(30), r3m=ret(90), r6m=ret(180), r1y=r1y,
            market_cap=cap[0] if cap else None, market_cap_rank=cap[1] if cap else None,
        ))
    return PeriodReturns(rows=rows)


def get_period_returns() -> PeriodReturns:
    return cached("trends:period_returns", config.TTL_COIN_STATS, _compute_period_returns)


# ── 시황 (자체 생성) ───────────────────────────────────────────
def _fmt_won(v: float) -> str:
    if v >= 1e12:
        return f"{v / 1e12:.1f}조원"
    if v >= 1e8:
        return f"{v / 1e8:.0f}억원"
    return f"{v:,.0f}원"


def _compute_brief() -> MarketBrief:
    tickers = market_service.get_tickers()
    rise = sum(1 for t in tickers if t.change == "RISE")
    fall = sum(1 for t in tickers if t.change == "FALL")
    total = sum(t.acc_trade_price_24h for t in tickers)
    btc = next((t for t in tickers if t.market == "KRW-BTC"), None)
    # 도미넌스는 업계 표준인 '시총 기준'(CoinGecko /global)을 우선 쓰고, 외부 실패 시에만
    # 거래대금 비중으로 폴백한다(라벨로 출처를 명시 — 둘은 다른 지표다).
    glob = marketcap_service.get_global()
    if glob.get("btc_dominance"):
        dom = float(glob["btc_dominance"])
        dom_label = "BTC 시총 지배력"
    else:
        dom = round(btc.acc_trade_price_24h / total * 100, 1) if (btc and total) else 0.0
        dom_label = "BTC 거래대금 비중"
    avg = round(sum(t.change_rate for t in tickers) / len(tickers) * 100, 2) if tickers else 0.0
    mood = "상승 우위" if rise > fall else "하락 우위" if fall > rise else "혼조세"
    top = max(tickers, key=lambda t: t.change_rate, default=None)
    top_txt = f" 상승률 1위는 {top.korean_name}({top.change_rate * 100:+.1f}%)." if top else ""
    text = (f"오늘 시장은 {mood}입니다 (상승 {rise}·하락 {fall}종, 평균 등락 {avg:+.2f}%). "
            f"{dom_label} {dom}%, 24h 총 거래대금 {_fmt_won(total)}.{top_txt}")
    return MarketBrief(text=text, as_of=datetime.now(_KST).strftime("%Y-%m-%d %H:%M KST"),
                       rise=rise, fall=fall, avg_change=avg, dominance=dom,
                       dominance_label=dom_label, total_volume=total)


def get_brief() -> MarketBrief:
    return cached("trends:brief", config.TTL_TICKER, _compute_brief)
