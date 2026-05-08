import math

from app.schemas.analysis import CategoryMonthly, CoinStat
from app.services import candle_service, market_service

# 카테고리 분류 (Upbit KRW 마켓 기준)
_CATEGORIES: dict[str, str] = {
    "KRW-BTC":   "layer1",
    "KRW-ETH":   "layer1",
    "KRW-SOL":   "layer1",
    "KRW-AVAX":  "layer1",
    "KRW-DOT":   "layer1",
    "KRW-ATOM":  "layer1",
    "KRW-NEAR":  "layer1",
    "KRW-ADA":   "layer1",
    "KRW-XRP":   "layer1",
    "KRW-LINK":  "defi",
    "KRW-1INCH": "defi",
    "KRW-DOGE":  "meme",
    "KRW-SAND":  "gaming",
    "KRW-MANA":  "gaming",
    "KRW-MATIC": "layer2",
}

# 카테고리별 월간 수익률 — Upbit /v1/candles/months 기반으로 교체 예정
_MONTHLY_RAW = [
    {"month": "2025-12", "layer1": 12.3, "defi":  8.1, "meme":  22.5, "gaming": -3.2, "layer2":  5.4},
    {"month": "2026-01", "layer1": -8.2, "defi": -12.1,"meme": -18.3, "gaming": -8.9, "layer2":-10.1},
    {"month": "2026-02", "layer1": 15.6, "defi":  9.3, "meme":  28.7, "gaming":  2.1, "layer2": 11.2},
    {"month": "2026-03", "layer1":  3.2, "defi": -2.1, "meme":   8.9, "gaming": -5.3, "layer2":  1.8},
    {"month": "2026-04", "layer1": -5.1, "defi":  1.2, "meme": -12.4, "gaming": -8.7, "layer2": -3.9},
    {"month": "2026-05", "layer1":  7.8, "defi":  4.1, "meme":  15.2, "gaming": -1.2, "layer2":  3.4},
]

_CATS = ["layer1", "defi", "meme", "gaming", "layer2"]


def get_category_monthly() -> list[CategoryMonthly]:
    return [CategoryMonthly(**row) for row in _MONTHLY_RAW]


def get_category_cumulative() -> list[CategoryMonthly]:
    cum = {c: 100.0 for c in _CATS}
    result = []
    for row in _MONTHLY_RAW:
        for cat in _CATS:
            cum[cat] *= (1 + row[cat] / 100)
        result.append(CategoryMonthly(
            month=row["month"],
            **{cat: round(cum[cat] - 100, 2) for cat in _CATS},
        ))
    return result


def _volatility(market: str) -> float:
    """30일 일간 수익률의 표준편차 (Upbit /v1/candles/days 기반)"""
    candles = candle_service.get_candles(market, "days", count=31)
    closes = [c.close for c in candles]
    if len(closes) < 3:
        return 0.0
    returns = [(closes[i] - closes[i - 1]) / closes[i - 1] * 100 for i in range(1, len(closes))]
    mean = sum(returns) / len(returns)
    var = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    return round(math.sqrt(var), 2)


def _return_1m(market: str) -> float:
    """최근 30일 총 수익률 (Upbit /v1/candles/days 기반)"""
    candles = candle_service.get_candles(market, "days", count=30)
    if len(candles) < 2:
        return 0.0
    first, last = candles[0].close, candles[-1].close
    return round((last - first) / first * 100, 2) if first else 0.0


def get_coin_stats() -> list[CoinStat]:
    ticker_map = {t.market: t for t in market_service.get_tickers()}
    result = []
    for market, category in _CATEGORIES.items():
        t = ticker_map.get(market)
        if not t:
            continue
        result.append(CoinStat(
            market=market,
            korean_name=t.korean_name,
            category=category,
            volatility=_volatility(market),
            return_1m=_return_1m(market),
            acc_trade_price_24h=t.acc_trade_price_24h,
        ))
    return result
