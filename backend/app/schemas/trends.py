"""트렌드(대시보드) 응답 스키마 — 업비트 '코인동향' 미러용.
자체 시장지수 · 기간별 수익률 · 환율(외부) · 뉴스(외부) · 시황(자체)."""
from pydantic import BaseModel


# ── 자체 시장 지수 (동일가중) ──────────────────────────────────
class IntradayPoint(BaseModel):
    h: float            # KST 시각(시 단위, 0~24 소수)
    pct: float          # 그날 시가 대비 % 변화


class MarketIndex(BaseModel):
    key: str            # total | alt | btc | eth | top10 | top30
    label: str
    value: float        # 지수 레벨(기준 100)
    change_rate: float  # 전일대비(소수)
    spark: list[float]  # 최근 일봉 추세
    today: list[IntradayPoint] = []   # 당일 인트라데이(60분봉, 시가 대비 %)
    prev: list[IntradayPoint] = []    # 전일 인트라데이
    n: int              # 구성 종목 수


class TrendsIndices(BaseModel):
    indices: list[MarketIndex]


# ── 체결 강도 (WS acc_ask/bid_volume) ──────────────────────────
class VolumePowerItem(BaseModel):
    market: str
    korean_name: str
    power: float        # 체결강도 = 매수체결량/매도체결량 × 100 (>100 매수 우위)


class VolumePower(BaseModel):
    buy: list[VolumePowerItem]    # 매수 체결강도 상위
    sell: list[VolumePowerItem]   # 매도 체결강도 상위(체결강도 낮은 = 매도 우위)
    error: str | None = None


# ── 디지털 자산 지수 표 (시장/전략/테마/섹터) ──────────────────
class AssetIndexRow(BaseModel):
    key: str
    label: str
    desc: str           # 개요
    tab: str            # 시장 | 전략 | 테마 | 섹터
    value: float        # 지수 레벨(기준 100)
    d1: float | None = None   # 전일대비 %
    m1: float | None = None   # 1개월 %
    m3: float | None = None   # 3개월 %
    n: int


class AssetIndices(BaseModel):
    rows: list[AssetIndexRow]


# ── 기간별 수익률 표 ───────────────────────────────────────────
class PeriodReturnRow(BaseModel):
    market: str
    korean_name: str
    acc_trade_price_24h: float
    r1w: float | None = None   # 1주
    r1m: float | None = None   # 1개월
    r3m: float | None = None   # 3개월
    r6m: float | None = None   # 6개월
    r1y: float | None = None   # 1년
    market_cap: float | None = None       # 시가총액(KRW, 외부 CoinGecko)
    market_cap_rank: int | None = None     # 시총 순위


class PeriodReturns(BaseModel):
    rows: list[PeriodReturnRow]


# ── 환율 (외부 FX API) ─────────────────────────────────────────
class FxRate(BaseModel):
    pair: str           # 예: USD/KRW
    label: str          # 미국 등
    unit: int           # 표시 단위(JPY는 100)
    price: float        # KRW
    change: float       # 전일대비(절대)
    change_rate: float  # 전일대비(소수)


class FxResult(BaseModel):
    rates: list[FxRate]
    as_of: str
    error: str | None = None   # 외부 소스 실패 시 "교체 필요" 메시지(숨기지 않고 노출)


# ── 뉴스 (외부 RSS) ────────────────────────────────────────────
class NewsItem(BaseModel):
    title: str
    url: str
    source: str
    published: str   # 표시용 문자열(파싱 실패 시 빈 문자열)
    ts: int          # 정렬용 unix초(없으면 0)


class NewsResult(BaseModel):
    items: list[NewsItem]
    error: str | None = None   # 외부 소스 실패 시 "교체 필요" 메시지


# ── 시황 (자체 생성) ───────────────────────────────────────────
class MarketBrief(BaseModel):
    text: str
    as_of: str
    rise: int
    fall: int
    avg_change: float
    dominance: float
    total_volume: float
