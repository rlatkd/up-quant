import random
import time

from app.schemas.market import Orderbook, OrderbookUnit, MarketSummary, Ticker, Trade

_RAW = [
    # market, korean_name, price, change_rate, change_price, vol_24h, high, low
    ("KRW-BTC",   "비트코인",      119_642_000,  0.0234,  2_731_000, 487_200_000_000, 120_100_000, 116_800_000),
    ("KRW-ETH",   "이더리움",        3_812_000,  0.0187,     70_000, 182_000_000_000,   3_850_000,   3_720_000),
    ("KRW-XRP",   "리플",               3_248,  0.0521,        161,  52_800_000_000,       3_310,       3_050),
    ("KRW-SOL",   "솔라나",           231_500, -0.0123,      2_880,  28_600_000_000,     235_000,     228_500),
    ("KRW-DOGE",  "도지코인",             452,  0.0345,         15,  18_400_000_000,         465,         432),
    ("KRW-ADA",   "에이다",               812, -0.0067,          5,   9_200_000_000,         830,         798),
    ("KRW-LINK",  "체인링크",          22_450,  0.0412,        886,  14_300_000_000,      23_100,      21_500),
    ("KRW-AVAX",  "아발란체",          46_200, -0.0234,      1_125,  11_800_000_000,      47_900,      45_100),
    ("KRW-DOT",   "폴카닷",            11_850,  0.0123,        144,   8_700_000_000,      12_100,      11_600),
    ("KRW-ATOM",  "코스모스",          11_200, -0.0045,         50,   6_300_000_000,      11_500,      10_900),
    ("KRW-NEAR",  "니어프로토콜",       7_620,  0.0278,        209,   5_100_000_000,       7_850,       7_380),
    ("KRW-SAND",  "샌드박스",             548, -0.0189,         10,   3_800_000_000,         572,         536),
    ("KRW-MANA",  "디센트럴랜드",         382,  0.0087,          3,   2_900_000_000,         391,         374),
    ("KRW-MATIC", "폴리곤",             1_125,  0.0034,          4,   4_200_000_000,       1_145,       1_105),
    ("KRW-1INCH", "1인치",               582, -0.0321,         19,   1_800_000_000,         615,         570),
]

_52W_HIGH = {"KRW-BTC", "KRW-XRP", "KRW-LINK", "KRW-DOGE"}
_52W_LOW  = {"KRW-SOL", "KRW-AVAX", "KRW-SAND", "KRW-1INCH"}


def _w52_range(market: str, price: float) -> tuple[float, float]:
    rng = random.Random(hash(market + "52w"))
    high = round(price * rng.uniform(1.15, 2.8))
    low  = round(price * rng.uniform(0.25, 0.75))
    return high, low


def _sparkline(market: str, price: float, rate: float) -> list[float]:
    rng = random.Random(hash(market))
    prev = price / (1 + rate)
    pts = [prev]
    for _ in range(18):
        pts.append(pts[-1] * (1 + rng.uniform(-0.008, 0.008)))
    pts.append(price)
    return [round(p, 2) for p in pts]


_TICKERS: list[Ticker] = [
    Ticker(
        market=m,
        korean_name=name,
        trade_price=price,
        change="RISE" if rate > 0 else ("FALL" if rate < 0 else "EVEN"),
        change_rate=rate,
        change_price=cp,
        acc_trade_price_24h=vol,
        high_price=high,
        low_price=low,
        prev_closing_price=round(price / (1 + rate)),
        sparkline=_sparkline(m, price, rate),
        is_52w_high=m in _52W_HIGH,
        is_52w_low=m in _52W_LOW,
        w52_high=_w52_range(m, price)[0],
        w52_low=_w52_range(m, price)[1],
    )
    for m, name, price, rate, cp, vol, high, low in _RAW
]

_TICKER_MAP: dict[str, Ticker] = {t.market: t for t in _TICKERS}


def get_tickers() -> list[Ticker]:
    return _TICKERS


def get_ticker(market: str) -> Ticker | None:
    return _TICKER_MAP.get(market)


def get_market_summary() -> MarketSummary:
    up = sum(1 for t in _TICKERS if t.change == "RISE")
    down = sum(1 for t in _TICKERS if t.change == "FALL")
    total = sum(t.acc_trade_price_24h for t in _TICKERS)
    btc = _TICKER_MAP.get("KRW-BTC")
    dom = (btc.acc_trade_price_24h / total * 100) if btc else 0
    return MarketSummary(
        total_volume=round(total),
        up_count=up,
        down_count=down,
        btc_dominance=round(dom, 1),
    )


def get_orderbook(market: str) -> Orderbook | None:
    ticker = _TICKER_MAP.get(market)
    if not ticker:
        return None
    rng = random.Random(hash(market + "ob"))
    price = ticker.trade_price
    # asks: 최우선 매도(+0.1%) → 최원거리 매도(+0.8%), 화면에서 역순 표시
    asks = [
        OrderbookUnit(price=round(price * (1 + 0.001 * (i + 1))), size=round(rng.uniform(0.01, 2.5), 4))
        for i in range(8)
    ]
    # bids: 최우선 매수(-0.1%) → 최원거리 매수(-0.8%)
    bids = [
        OrderbookUnit(price=round(price * (1 - 0.001 * (i + 1))), size=round(rng.uniform(0.01, 2.5), 4))
        for i in range(8)
    ]
    return Orderbook(market=market, asks=asks, bids=bids)


def get_trades(market: str) -> list[Trade]:
    ticker = _TICKER_MAP.get(market)
    if not ticker:
        return []
    rng = random.Random(hash(market + "tr"))
    price = ticker.trade_price
    now = int(time.time())
    return [
        Trade(
            timestamp=now - i * 12,
            price=round(price * (1 + rng.uniform(-0.002, 0.002))),
            volume=round(rng.uniform(0.001, 0.5), 4),
            side=rng.choice(["BID", "ASK"]),
        )
        for i in range(20)
    ]
