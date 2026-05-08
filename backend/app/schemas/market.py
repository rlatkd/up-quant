from pydantic import BaseModel


class Ticker(BaseModel):
    market: str
    korean_name: str
    trade_price: float
    change: str  # RISE | FALL | EVEN
    change_rate: float
    change_price: float
    acc_trade_price_24h: float
    high_price: float
    low_price: float
    prev_closing_price: float
    sparkline: list[float]


class MarketSummary(BaseModel):
    total_volume: float
    up_count: int
    down_count: int
    btc_dominance: float


class OrderbookUnit(BaseModel):
    price: float
    size: float


class Orderbook(BaseModel):
    market: str
    asks: list[OrderbookUnit]  # 낮은가격 → 높은가격 (index 0 = 최우선 매도)
    bids: list[OrderbookUnit]  # 높은가격 → 낮은가격 (index 0 = 최우선 매수)


class Trade(BaseModel):
    timestamp: int
    price: float
    volume: float
    side: str  # BID | ASK
