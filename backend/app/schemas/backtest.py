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
    # 리스크 조정 수익률 (일별 equity 수익률 기반, 암호화폐는 365일 거래 → √365 연율화)
    sharpe: float         # 샤프 = (평균/표준편차) × √365 — 변동성 단위당 수익
    sortino: float        # 소르티노 = (평균/하방표준편차) × √365 — 손실 변동성만 패널티
    calmar: float         # 칼마 = 연율화 수익률 / MDD — 낙폭 대비 수익


class BacktestResult(BaseModel):
    equity: list[EquityPoint]
    trades: list[TradeRecord]
    metrics: BacktestMetrics
