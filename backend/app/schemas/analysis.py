from pydantic import BaseModel


class CategoryMonthly(BaseModel):
    month: str  # "YYYY-MM"
    layer1: float
    defi: float
    meme: float
    gaming: float
    layer2: float


class CoinStat(BaseModel):
    market: str
    korean_name: str
    category: str | None = None  # 미매핑 코인은 None (카테고리 분류 소스 확정 전)
    volatility: float   # 30일 일간 수익률 표준편차 (%)
    return_1m: float    # 1개월 총 수익률 (%)
    acc_trade_price_24h: float


class CorrelationItem(BaseModel):
    market: str
    korean_name: str
    correlation: float  # -1.0 ~ 1.0
