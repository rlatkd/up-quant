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
