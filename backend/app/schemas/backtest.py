from pydantic import BaseModel


class EquityPoint(BaseModel):
    time: int      # unix timestamp (seconds)
    value: float   # 포트폴리오 가치 (초기 100 기준)


class TradeRecord(BaseModel):
    time: int
    side: str      # BUY | SELL
    price: float
    pnl: float     # 해당 거래 손익률 (%, SELL 시에만 의미있음)


class BacktestMetrics(BaseModel):
    total_return: float   # 총 수익률 (%)
    mdd: float            # 최대 낙폭 (%)
    win_rate: float       # 승률 (%)
    trade_count: int


class BacktestResult(BaseModel):
    equity: list[EquityPoint]
    trades: list[TradeRecord]
    metrics: BacktestMetrics
