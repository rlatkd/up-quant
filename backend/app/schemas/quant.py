"""퀀트/ML 분석 응답 스키마.

컨벤션: 각 엔드포인트는 하나의 결과 객체를 반환하며, 공통적으로 분석에 사용한
관측 수(n_obs)·종목 수 등 메타를 함께 담아 프론트가 신뢰구간/주석을 표기할 수 있게 한다.
좌표계는 (vol=변동성 x축, ret=수익률 y축) 으로 통일(%) — Markowitz 산점도 관습.
"""
from pydantic import BaseModel


# ── 1) 포트폴리오 최적화 (Markowitz 효율적 경계선) ──────────────
class PortfolioPoint(BaseModel):
    """무작위 가중 포트폴리오 1개 — 산점 구름의 한 점."""
    vol: float      # 연율 변동성 (%)
    ret: float      # 연율 기대수익률 (%)
    sharpe: float   # 샤프 (무위험수익률 0)


class PortfolioWeight(BaseModel):
    market: str
    korean_name: str
    weight: float   # 비중 0~1


class PortfolioSpot(BaseModel):
    """특정 최적 포트폴리오(최대샤프★ / 최소분산)의 좌표 + 종목별 비중."""
    vol: float
    ret: float
    sharpe: float
    weights: list[PortfolioWeight]
    # 자산별 리스크 기여도(%) — weights와 같은 순서. PCR_i = w_i·(Σw)_i / (wᵀΣw), 합 100.
    # "비중 ≠ 리스크 비중"을 보여준다(리스크 패리티는 이 값을 균등화한 해).
    risk_contrib: list[float] = []
    # 분산효과 비율 = (Σ w_i·σ_i) / σ_p ≥ 1. 클수록 분산으로 위험을 더 줄임(Choueifaty 2008).
    diversification: float = 1.0


class AssetPoint(BaseModel):
    """개별 종목 100% 단독 보유 시 (변동성, 수익률) — 경계선 대비용."""
    market: str
    korean_name: str
    vol: float
    ret: float
    sharpe: float = 0.0   # 연율 수익/변동성 (무위험수익률 0)


class FrontierPoint(BaseModel):
    """효율적 경계선 곡선 위 한 점 — 목표수익률별 최소분산 해."""
    vol: float      # 연율 변동성 (%)
    ret: float      # 연율 기대수익률 (%)
    weights: list[float] = []   # 이 목표수익률에서의 종목별 비중(assets 순서) — 슬라이더로 구성 확인


class PortfolioResult(BaseModel):
    points: list[PortfolioPoint]   # 무작위 시뮬 구름
    frontier: list[FrontierPoint]  # 효율적 경계선 곡선 (목표수익률별 최소분산, ret 오름차순)
    max_sharpe: PortfolioSpot      # ★ 샤프 최대 (탄젠시 포트폴리오)
    min_vol: PortfolioSpot         # 최소 변동성 포트폴리오
    risk_parity: PortfolioSpot     # ◆ 리스크 패리티(역변동성) — 기대수익 추정에 안 의존, OOS 견고
    assets: list[AssetPoint]       # 개별 종목 단독 보유점
    n_obs: int                     # 공분산 추정에 쓴 일간 수익률 관측 수
    shrinkage: float = 0.0         # Ledoit-Wolf 수축 강도(0~1, 표본공분산↔구조화 타깃)
    corr_labels: list[str] = []    # 상관행렬 종목 순서(market) — 선택 바스켓
    corr_matrix: list[list[float]] = []  # 자산 간 상관계수 행렬(분산효과의 근원 입력)


# ── 2) 상관 네트워크 (Mantegna 최소신장트리) ───────────────────
class NetworkNode(BaseModel):
    market: str
    korean_name: str
    category: str | None    # 업비트 섹터(대분류) — 노드 색
    value: float            # 24h 거래대금 — 노드 크기
    degree: int             # MST 연결 수 — 허브 판정(클수록 시장 중심)


class NetworkEdge(BaseModel):
    source: str             # market
    target: str             # market
    corr: float             # 두 종목 일간수익률 상관계수


class NetworkResult(BaseModel):
    nodes: list[NetworkNode]
    edges: list[NetworkEdge]   # MST 간선(노드수-1개)
    n_obs: int                 # 상관 추정 일간 관측 수


# ── 3) PCA 시장 요인 분석 ──────────────────────────────────────
class PCAComponent(BaseModel):
    index: int          # 1-based 주성분 번호
    explained: float    # 설명분산 비율 (%)


class PCALoading(BaseModel):
    market: str
    korean_name: str
    category: str | None
    pc1: float          # 제1주성분 로딩(상관 스케일 -1~1) — 시장요인 동조도(≈시장 베타)
    pc2: float          # 제2주성분 로딩 — 시장과 독립적인 2차 축(섹터 회전 등)


class PCAResult(BaseModel):
    components: list[PCAComponent]   # 상위 주성분 설명력(스크리 플롯용)
    loadings: list[PCALoading]       # 종목별 PC1/PC2 로딩(산점도용)
    pc1_explained: float             # 제1주성분 설명비율(%) — "시장이 한 방향으로 움직인 정도" 헤드라인
    n_obs: int


# ── 4) 클러스터링 (K-means + 계층적 덴드로그램) ────────────────
class ClusterPoint(BaseModel):
    market: str
    korean_name: str
    category: str | None
    cluster: int            # K-means 군집 번호 (0-based)
    volatility: float       # 30일 변동성 (%) — 특징1
    return_1m: float        # 1개월 수익률 (%) — 특징2
    log_value: float        # log10(24h 거래대금) — 특징3


class ClusterResult(BaseModel):
    points: list[ClusterPoint]
    k: int                  # 군집 수
    n: int                  # 종목 수


class DendrogramResult(BaseModel):
    """scipy dendrogram(no_plot)의 플롯 좌표 — 프론트가 SVG 선분으로 그대로 그린다."""
    icoord: list[list[float]]   # 각 병합 링크의 x좌표 4점
    dcoord: list[list[float]]   # 각 병합 링크의 y좌표 4점(병합 거리)
    labels: list[str]           # 잎(leaf) 한글명 — 플롯 순서
    markets: list[str]          # 잎 마켓코드 — 플롯 순서
    categories: list[str | None]  # 잎 섹터 — 플롯 순서(잎 색)
    n_obs: int


# ── 5) GARCH(1,1) 변동성 예측 + VaR ────────────────────────────
class VolPoint(BaseModel):
    time: int      # unix seconds
    vol: float     # 조건부 일간 변동성 (%)


class GarchResult(BaseModel):
    market: str
    korean_name: str
    cond_vol: list[VolPoint]      # 인샘플 조건부 변동성 시계열(일간 %)
    forecast_vol: list[float]     # 향후 N일 일간 변동성 예측(%)
    current_vol_annual: float     # 최신 조건부 변동성 연율화(%) — 헤드라인
    var_95: float                 # 1일 95% VaR (%, 정규근사 — GARCH σ 기반)
    hist_var_95: float = 0.0      # 1일 95% VaR (%, 경험분위 — 실제 분포 5% 분위, 팻테일 반영)
    cvar_95: float = 0.0          # 1일 95% CVaR/기대손실 (%, 5% 꼬리 구간 평균손실 — VaR보다 보수적)
    persistence: float            # α+β (변동성 충격의 지속성, 1에 가까울수록 오래감)
    n_obs: int


# ── 6) 횡단면 모멘텀 팩터 백테스트 ─────────────────────────────
class MomentumEquityPoint(BaseModel):
    time: int          # unix seconds
    factor: float      # 롱숏 모멘텀 팩터 누적가치(100 시작)
    benchmark: float   # 동일가중 매수보유 벤치마크(100 시작)


class MomentumHolding(BaseModel):
    market: str
    korean_name: str
    category: str | None
    momentum: float    # 과거 lookback일 누적수익률(%) — 랭킹 기준
    leg: str           # LONG | SHORT


class MomentumResult(BaseModel):
    equity: list[MomentumEquityPoint]
    total_return: float       # 팩터 총수익률(%)
    benchmark_return: float   # 벤치마크 총수익률(%)
    sharpe: float             # 팩터 샤프(리밸런스 주기 연율화)
    mdd: float                # 팩터 최대낙폭(%)
    long: list[MomentumHolding]   # 현재 롱(모멘텀 상위)
    short: list[MomentumHolding]  # 현재 숏(모멘텀 하위)
    lookback: int             # 모멘텀 산정 기간(일)
    holding: int              # 리밸런스 주기(일)
    n: int                    # 유니버스 종목 수
    fee_bps: float = 0.0      # 적용한 편도 거래비용(bps) — 리밸런스 회전에 차감
    long_only: bool = False   # True면 상위분위 매수만(공매도 제외) — 업비트 현물에서 실행 가능한 버전


# ── 7) 공적분 페어트레이딩 스크리너 ───────────────────────────
class CointPair(BaseModel):
    market1: str
    korean_name1: str
    market2: str
    korean_name2: str
    pvalue: float        # Engle-Granger 공적분 검정 p값(작을수록 공적분 강함)
    correlation: float   # 두 로그가격 변화 상관
    hedge_ratio: float   # OLS 헤지비율 β (market1 ≈ α + β·market2)
    zscore: float        # 현재 스프레드 z점수(평균회귀 신호)
    signal: str          # LONG_SPREAD | SHORT_SPREAD | NEUTRAL
    # 사후검증(forward test) — 같은 윈도우에서 스프레드 평균회귀 전략을 돌린 요약(롤링 z로 진입/청산).
    bt_return: float = 0.0    # 백테스트 누적수익률(%)
    bt_trades: int = 0        # 진입 횟수
    bt_winrate: float = 0.0   # 익절 비율(%)


class PairBacktestPoint(BaseModel):
    time: int       # unix초
    z: float        # 롤링 스프레드 z점수
    equity: float   # 전략 자산곡선(100 시작)


class PairBacktestDetail(BaseModel):
    """최우수(최저 p값) 페어의 상세 — 스프레드 z 시계열 + 전략 자산곡선(프론트 차트용)."""
    market1: str
    korean_name1: str
    market2: str
    korean_name2: str
    entry: float    # 진입 임계 |z|
    exit: float     # 청산 임계 |z|
    formation_end: int = 0  # 형성기간 종료 unix초 — 이 이전은 β 추정용(거래 없음), 이후가 out-of-sample 거래기간
    points: list[PairBacktestPoint]


class PairsResult(BaseModel):
    pairs: list[CointPair]   # p값 오름차순(공적분 강한 순)
    tested: int              # 검정한 페어 수
    found: int               # 공적분(p<0.05) 페어 수
    n_obs: int
    best: PairBacktestDetail | None = None   # 최우수 페어 사후검증 상세(차트용)


# ── 8) HMM 시장 국면(regime) 탐지 ─────────────────────────────
class RegimePoint(BaseModel):
    time: int            # unix seconds
    regime: int          # 국면 번호(0=가장 약세, 오름차순 정렬됨)
    index: float         # 동일가중 시장지수(100 시작, 누적) — 국면 밴드 배경용


class RegimeStat(BaseModel):
    regime: int
    label: str           # 약세/중립/강세 등
    mean_return: float   # 일평균 수익률(%)
    volatility: float    # 일변동성(%)
    days: int            # 해당 국면 일수
    share: float         # 비중(%)


class RegimeResult(BaseModel):
    points: list[RegimePoint]
    stats: list[RegimeStat]
    current_regime: int
    current_label: str
    n_states: int
    n_obs: int
