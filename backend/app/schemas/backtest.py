from pydantic import BaseModel


class EquityPoint(BaseModel):
    time: int          # unix timestamp (seconds)
    value: float       # 전략 자산 가치 (초기 100 기준, 거래비용 반영)
    benchmark: float = 100.0      # 동일 종목 매수보유(buy&hold) 가치 (초기 100 기준)
    benchmark_btc: float = 100.0  # BTC 매수보유 가치 (시장 대표 벤치마크, 초기 100 기준)


class TradeRecord(BaseModel):
    time: int
    side: str      # BUY | SELL
    price: float
    pnl: float     # 해당 거래 손익률 (%, SELL 시에만 의미있음)


class BacktestMetrics(BaseModel):
    total_return: float   # 총 수익률 (%, 거래비용 반영)
    benchmark_return: float = 0.0      # 종목 매수보유(buy&hold) 총 수익률 (%) — 전략의 초과수익(알파) 비교용
    benchmark_btc_return: float = 0.0  # BTC 매수보유 총 수익률 (%) — 시장 대표 대비 비교용
    mdd: float            # 최대 낙폭 (%)
    win_rate: float       # 승률 (%)
    trade_count: int
    fee_bps: float = 0.0       # 적용한 편도 거래비용 (bps, 1bps=0.01%)
    slippage_bps: float = 0.0  # 유동성 기반 추정 슬리피지 (편도 bps) — 거래대금 낮을수록 큼
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


# ── 다중 전략 겹쳐 비교 (한 종목에 여러 전략) ──────────────────
class StrategyCurve(BaseModel):
    name: str
    equity: list[float]    # 자산 곡선 (100 시작)
    total_return: float    # 총 수익률 (%)


class StrategyCompareResult(BaseModel):
    times: list[int]              # 공통 시간축 (unix seconds)
    strategies: list[StrategyCurve]
    benchmark: list[float]        # 종목 매수보유 (100 시작)
    benchmark_btc: list[float]    # BTC 매수보유 (100 시작)


# ── 워크포워드 (in-sample 최적화 → out-of-sample 검증) ─────────
class WalkForwardFold(BaseModel):
    fast: int           # in-sample에서 선택된 MA 단기
    slow: int           # in-sample에서 선택된 MA 장기
    oos_return: float   # 해당 out-of-sample 구간 수익률 (%)
    train_end: int      # in-sample 종료 시점 (unix seconds)
    test_end: int       # out-of-sample 종료 시점 (unix seconds)


class WalkForwardResult(BaseModel):
    folds: list[WalkForwardFold]
    equity: list[EquityPoint]  # out-of-sample만 이어붙인 누적 자산 곡선
    total_return: float        # out-of-sample 누적 총수익률 (%)
    n_splits: int
    # 다중검정 보정 — 그리드(N개 파라미터)에서 고른 '최고 인샘플 샤프'가 순전히 우연일 확률.
    # 귀무가설(수익률 평균 0) 하 N회 시도의 최대 샤프 분포와 비교. 낮을수록 과최적화 아님(예: <0.1 양호).
    overfit_pvalue: float = 1.0
    n_trials: int = 0          # 시도한 파라미터 조합 수


# ── 몬테카를로 시뮬레이션 (미래 가격 경로 N개) ─────────────────
class MonteCarloPoint(BaseModel):
    day: int     # 0(현재)..horizon
    p5: float    # 하위 5% 시나리오 가치 (100 시작)
    p25: float
    p50: float   # 중앙값
    p75: float
    p95: float   # 상위 5% 시나리오


class MonteCarloResult(BaseModel):
    market: str
    korean_name: str
    bands: list[MonteCarloPoint]   # 시점별 백분위 밴드 (부채꼴 차트용)
    horizon: int                   # 시뮬레이션 일수
    n_paths: int                   # 경로 수
    final_p5: float                # horizon 후 하위 5% 수익률 (%)
    final_p50: float               # 중앙값 수익률 (%)
    final_p95: float               # 상위 5% 수익률 (%)
    expected_return: float         # 평균 최종 수익률 (%)
    prob_loss: float               # 손실 확률 (%) — 최종가 < 시작가 비율
    daily_mean: float              # 과거 일평균 수익률 (%)
    daily_vol: float               # 과거 일변동성 (%)
    n_obs: int


# ── 시계열 모멘텀(추세추종) + 변동성 타게팅 ────────────────────
class TsmomEquityPoint(BaseModel):
    time: int          # unix seconds
    value: float       # 전략 자산 가치 (100 시작)
    benchmark: float   # 동일가중 매수보유 (100 시작)


class TsmomHolding(BaseModel):
    market: str
    korean_name: str
    momentum: float    # 최신 시계열 모멘텀 = 룩백 기간 수익률 (%)
    weight: float      # 현재 목표 비중 (%, 변동성 역가중)


class TsmomResult(BaseModel):
    equity: list[TsmomEquityPoint]
    total_return: float        # 전략 총수익률 (%)
    benchmark_return: float    # 동일가중 매수보유 총수익률 (%)
    sharpe: float              # 연율화 샤프
    mdd: float                 # 최대 낙폭 (%)
    avg_exposure: float        # 평균 투자 비중 (%, 추세 양(+)인 종목 비율 — 100이면 항상 풀투자)
    holdings: list[TsmomHolding]  # 현재(최신) 보유 종목
    lookback: int              # 추세 판단 룩백(일)
    holding: int               # 리밸런스 주기(일)
    n: int                     # 유니버스 종목 수
    fee_bps: float
