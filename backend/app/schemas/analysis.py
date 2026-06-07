from pydantic import BaseModel


class CategoryReturns(BaseModel):
    """카테고리(섹터)별 기간 수익률. 카테고리가 가변(업비트 분류)이라 고정 필드 대신
    rows의 각 항목에 라벨(label)과 카테고리명→수익률(%)을 담는다."""
    categories: list[str]              # 표시 순서대로의 섹터명 (예: ["인프라", "디파이", ...])
    rows: list[dict[str, float | str]]  # [{"label": "2026-01", "<섹터>": 1.2, ...}, ...]


class CoinStat(BaseModel):
    market: str
    korean_name: str
    category: str | None = None  # 업비트 섹터(대분류). 스냅샷에 없는 신규 상장 종목은 None
    volatility: float   # 30일 일간 수익률 표준편차 (%)
    return_1m: float    # 1개월 총 수익률 (%)
    acc_trade_price_24h: float
    btc_beta: float = 0.0     # BTC 대비 베타 (30일 일간수익률 OLS 회귀계수). 1=BTC와 동행, >1=더 민감
    vol_zscore: float = 0.0   # 전종목 변동성 분포에서 이 종목의 표준화 위치 (평균 대비 ±σ)
    vol_surge: float = 0.0    # 거래량 급증 배수 = 최신 일봉 거래량 / 직전 7일 평균 (≥3이면 급증)


class CorrelationItem(BaseModel):
    market: str
    korean_name: str
    correlation: float  # -1.0 ~ 1.0


class AdvanceDeclinePoint(BaseModel):
    time: int          # unix seconds (KST 일봉)
    ad_line: int       # 누적 (상승 종목 수 − 하락 종목 수)
    advancers: int     # 그날 상승 종목 수
    decliners: int     # 그날 하락 종목 수
    index: float       # 동일가중 시장지수 (윈도우 첫날=100)


class AdvanceDeclineResult(BaseModel):
    """Advance-Decline 라인 — 시장 폭(breadth)의 추세.

    매일 (상승−하락) 종목 수를 누적한 라인. 시장지수는 오르는데 A-D 라인이 안 오르면
    소수 대형주만 끌어올린 것(divergence). 동일가중 시장지수를 함께 줘 비교한다.
    """
    points: list[AdvanceDeclinePoint]
    n: int             # 집계 종목 수 (거래대금 상위 N 중 유효)
    n_obs: int         # 일수
