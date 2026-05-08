import random
import time

from app.schemas.candle import CandleItem

_SEEDS: dict[str, tuple[float, float]] = {
    "KRW-BTC":   (119_642_000, 0.025),
    "KRW-ETH":   (3_812_000,   0.030),
    "KRW-XRP":   (3_248,       0.040),
    "KRW-SOL":   (231_500,     0.035),
    "KRW-DOGE":  (452,         0.050),
    "KRW-ADA":   (812,         0.040),
    "KRW-LINK":  (22_450,      0.035),
    "KRW-AVAX":  (46_200,      0.040),
    "KRW-DOT":   (11_850,      0.030),
    "KRW-ATOM":  (11_200,      0.035),
    "KRW-NEAR":  (7_620,       0.040),
    "KRW-SAND":  (548,         0.050),
    "KRW-MANA":  (382,         0.050),
    "KRW-MATIC": (1_125,       0.040),
    "KRW-1INCH": (582,         0.050),
}

_INTERVAL_SECONDS = {"minutes": 60, "days": 86_400, "weeks": 604_800}


def get_candles(market: str, interval: str = "days", count: int = 60) -> list[CandleItem]:
    target, vol = _SEEDS.get(market, (10_000, 0.04))
    rng = random.Random(hash(market + interval))

    step = _INTERVAL_SECONDS.get(interval, 86_400)
    start = int(time.time()) - count * step

    price = target * 0.85
    candles: list[CandleItem] = []

    for i in range(count):
        o = price
        c = o * (1 + rng.uniform(-vol, vol))
        h = max(o, c) * rng.uniform(1.001, 1.015)
        lo = min(o, c) * rng.uniform(0.985, 0.999)
        candles.append(CandleItem(
            timestamp=(start + i * step) * 1_000,
            open=round(o),
            high=round(h),
            low=round(lo),
            close=round(c),
            volume=round(rng.uniform(100, 5_000), 4),
        ))
        price = c

    if candles:
        last = candles[-1]
        candles[-1] = CandleItem(
            timestamp=last.timestamp,
            open=last.open,
            high=max(last.high, target),
            low=min(last.low, target),
            close=target,
            volume=last.volume,
        )

    return candles
