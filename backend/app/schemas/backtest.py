from pydantic import BaseModel


class EquityPoint(BaseModel):
    time: int          # unix timestamp (seconds)
    value: float       # 전략 자산 가치 (초기 100 기준, 거래비용 반영)
    benchmark: float = 100.0  # 동일 종목 매수보유(buy&hold) 가치 (초기 100 기준)


class TradeRecord(BaseModel):
    time: int
    side: str      # BUY | SELL
    price: float
    pnl: float     # 해당 거래 손익률 (%, SELL 시에만 의미있음)


class BacktestMetrics(BaseModel):
    total_return: float   # 총 수익률 (%, 거래비용 반영)
    benchmark_return: float = 0.0  # 매수보유(buy&hold) 총 수익률 (%) — 전략의 초과수익(알파) 비교용
    mdd: float            # 최대 낙폭 (%)
    win_rate: float       # 승률 (%)
    trade_count: int
    fee_bps: float = 0.0  # 적용한 편도 거래비용 (bps, 1bps=0.01%)
    # 리스크 조정 수익률 (일별 equity 수익률 기반, 암호화폐는 365일 거래 → √365 연율화)
    sharpe: float         # 샤프 = (평균/표준편차) × √365 — 변동성 단위당 수익
    sortino: float        # 소르티노 = (평균/하방표준편차) × √365 — 손실 변동성만 패널티
    calmar: float         # 칼마 = 연율화 수익률 / MDD — 낙폭 대비 수익


class BacktestResult(BaseModel):
    equity: list[EquityPoint]
    trades: list[TradeRecord]
    metrics: BacktestMetrics


# ── 포트폴리오 백테스트 (여러 종목 가중 보유) ──────────────────
class PortfolioBacktestPoint(BaseModel):
    time: int          # unix seconds
    value: float       # 가중 포트폴리오 가치 (100 시작)
    benchmark: float   # 동일가중 매수보유 벤치마크 (100 시작)


class AssetContribution(BaseModel):
    market: str
    korean_name: str
    weight: float          # 목표 비중 0~1
    asset_return: float    # 해당 종목 기간 수익률 (%)


class PortfolioBacktestResult(BaseModel):
    equity: list[PortfolioBacktestPoint]
    total_return: float        # 포트폴리오 총수익률 (%)
    benchmark_return: float    # 동일가중 벤치마크 총수익률 (%)
    mdd: float                 # 최대 낙폭 (%)
    sharpe: float              # 연율화 샤프
    volatility: float          # 연율화 변동성 (%)
    contributions: list[AssetContribution]
    rebalance_days: int        # 리밸런스 주기(일), 0=매수보유(드리프트)
    n_obs: int
