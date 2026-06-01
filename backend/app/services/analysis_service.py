import math
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from app.core import config
from app.core.cache import cached
from app.core.config import MARKET_CATEGORIES
from app.schemas.analysis import CategoryReturns, CoinStat, CorrelationItem
from app.services import candle_service, market_service

# 카테고리(섹터) 분류는 config로 중앙화 — 업비트 데이터랩 '코인 분류' 스냅샷 기반.
_CATEGORIES = MARKET_CATEGORIES
_KST = timezone(timedelta(hours=9))  # 월봉 라벨은 KST 월 기준

# 누적 수익률 기간 옵션 → (집계 단위 개월, 표시 구간 수)
_PERIOD_SPEC = {
    "월":  (1, 12),   # 최근 12개월
    "분기": (3, 12),   # 최근 12분기(=36개월)
    "년":  (12, 5),   # 최근 5년
}


def _month_label(ts_ms: int) -> str:
    """캔들 timestamp(ms) → 'YYYY-MM' (KST 월 기준)."""
    return datetime.fromtimestamp(ts_ms / 1000, tz=_KST).strftime("%Y-%m")


def _sector_monthly_avg_series(n_months: int = 61) -> dict[str, list[tuple[str, float]]]:
    """섹터별 월간 수익률(동일가중 평균) 시계열. {섹터: [(월라벨, 수익률%), ...]} (오래된→최신).

    각 코인의 월봉 close로 전월 대비 수익률을 구해, 같은 달에 데이터가 있는 코인끼리
    단순 평균한다. (업비트 시세 API는 시총을 주지 않아 시총가중 대신 동일가중)
    261종 월봉 팬아웃이라 결과를 장기 캐시한다.
    """
    def build() -> dict[str, list[tuple[str, float]]]:
        acc: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
        # 스냅샷 분류엔 상폐 코드(예: KRW-DRIFT)가 남아 있을 수 있다 → 라이브 마켓
        # (/market/all, 장시간 캐시)과 교집합만 순회해 404를 원천 차단한다.
        live = set(market_service.valid_markets())
        for market, cat in _CATEGORIES.items():
            if market not in live:
                continue
            candles = candle_service.get_candles(market, "months", count=n_months)
            closes = [(_month_label(c.timestamp), c.close) for c in candles]
            for i in range(1, len(closes)):
                (lbl, c1), (_, c0) = closes[i], closes[i - 1]
                if c0:
                    acc[cat][lbl].append((c1 - c0) / c0 * 100)
        result: dict[str, list[tuple[str, float]]] = {}
        for cat in config.CATEGORY_LIST:
            series = [(lbl, sum(v) / len(v)) for lbl, v in sorted(acc[cat].items()) if v]
            result[cat] = series
        return result

    return cached("category:monthly_series", config.TTL_CATEGORY, build)


def _all_labels(series: dict[str, list[tuple[str, float]]]) -> list[str]:
    return sorted({lbl for s in series.values() for lbl, _ in s})


def get_category_monthly() -> CategoryReturns:
    """최근 6개월 섹터별 월간 수익률(%)."""
    def build() -> CategoryReturns:
        series = _sector_monthly_avg_series()
        cats = config.CATEGORY_LIST
        labels = _all_labels(series)[-6:]
        cat_map = {c: dict(series[c]) for c in cats}
        rows: list[dict] = []
        for lbl in labels:
            row: dict = {"label": lbl}
            for c in cats:
                row[c] = round(cat_map[c].get(lbl, 0.0), 2)
            rows.append(row)
        return CategoryReturns(categories=cats, rows=rows)

    return cached("category:monthly", config.TTL_CATEGORY, build)


def _period_key(label: str, period: str) -> str:
    """월라벨 'YYYY-MM' → 구간 표시 라벨."""
    y, m = label.split("-")
    if period == "분기":
        return f"{y}Q{(int(m) - 1) // 3 + 1}"
    if period == "년":
        return y
    return label  # 월


def get_category_cumulative(period: str = "월") -> CategoryReturns:
    """기간별 섹터 누적 등락률(%) — 첫 구간 대비 누적곱."""
    unit, n_units = _PERIOD_SPEC.get(period, _PERIOD_SPEC["월"])

    def build() -> CategoryReturns:
        series = _sector_monthly_avg_series()
        cats = config.CATEGORY_LIST
        labels = _all_labels(series)
        cat_map = {c: dict(series[c]) for c in cats}

        # 시간순 구간 키 목록 (유니크) → 최근 n_units개만
        keys: list[str] = []
        for lbl in labels:
            k = _period_key(lbl, period)
            if k not in keys:
                keys.append(k)
        sel = keys[-n_units:]

        rows: list[dict] = []
        cum = {c: 1.0 for c in cats}
        for k in sel:
            months_in = [lbl for lbl in labels if _period_key(lbl, period) == k]
            row: dict = {"label": k}
            for c in cats:
                factor = 1.0
                for lbl in months_in:
                    r = cat_map[c].get(lbl)
                    if r is not None:
                        factor *= 1 + r / 100
                cum[c] *= factor
                row[c] = round((cum[c] - 1) * 100, 2)
            rows.append(row)
        return CategoryReturns(categories=cats, rows=rows)

    return cached(f"category:cumulative:{period}", config.TTL_CATEGORY, build)


def _volatility(market: str) -> float:
    """30일 일간 수익률의 표준편차 (Upbit /v1/candles/days 기반)"""
    candles = candle_service.get_candles(market, "days", count=30)
    closes = [c.close for c in candles]
    if len(closes) < 3:
        return 0.0
    returns = [(closes[i] - closes[i - 1]) / closes[i - 1] * 100 for i in range(1, len(closes))]
    mean = sum(returns) / len(returns)
    var = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    return round(math.sqrt(var), 2)


def _return_1m(market: str) -> float:
    """최근 30일 총 수익률 (Upbit /v1/candles/days 기반)"""
    candles = candle_service.get_candles(market, "days", count=30)
    if len(candles) < 2:
        return 0.0
    first, last = candles[0].close, candles[-1].close
    return round((last - first) / first * 100, 2) if first else 0.0


def _pearson(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 3:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return round(num / (dx * dy), 3) if dx * dy else 0.0


def get_correlation(market: str) -> list[CorrelationItem]:
    all_markets = [m for m in _CATEGORIES.keys() if m != market]
    base_candles = candle_service.get_candles(market, "days", 60)
    base_closes  = [c.close for c in base_candles]

    ticker_map = {t.market: t for t in market_service.get_tickers()}
    result = []
    for m in all_markets:
        candles = candle_service.get_candles(m, "days", 60)
        closes  = [c.close for c in candles]
        n = min(len(base_closes), len(closes))
        corr = _pearson(base_closes[-n:], closes[-n:])
        t = ticker_map.get(m)
        result.append(CorrelationItem(
            market=m,
            korean_name=t.korean_name if t else m,
            correlation=corr,
        ))
    return sorted(result, key=lambda x: x.correlation, reverse=True)


def _compute_coin_stats() -> list[CoinStat]:
    # 분석 유니버스 전체를 대상으로 변동성·1개월 수익률 산출 (공용 일봉 캐시 재사용).
    # 카테고리는 업비트 섹터 스냅샷에 있으면 부여, 없으면 None (신규 상장 등).
    tickers = market_service.get_tickers()
    result = []
    for t in tickers:
        result.append(CoinStat(
            market=t.market,
            korean_name=t.korean_name,
            category=_CATEGORIES.get(t.market),
            volatility=_volatility(t.market),
            return_1m=_return_1m(t.market),
            acc_trade_price_24h=t.acc_trade_price_24h,
        ))
    return result


def get_coin_stats() -> list[CoinStat]:
    # 전체 유니버스면 코인 수가 많아 계산 비용이 커지므로 짧게 캐시한다.
    return cached("coin_stats", config.TTL_TICKER, _compute_coin_stats)
