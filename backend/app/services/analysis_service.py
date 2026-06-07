import math
from collections import defaultdict
from datetime import datetime, timezone, timedelta

import numpy as np

from app.core import config
from app.core.cache import cached
from app.core.config import MARKET_CATEGORIES
from app.schemas.analysis import (
    AdvanceDeclinePoint,
    AdvanceDeclineResult,
    CategoryReturns,
    CoinStat,
    CorrelationItem,
)
from app.services import candle_service, market_service

# 카테고리(섹터) 분류는 config로 중앙화 — 업비트 데이터랩 '코인 분류' 스냅샷 기반.
_CATEGORIES = MARKET_CATEGORIES
_KST = timezone(timedelta(hours=9))  # 월봉 라벨은 KST 월 기준


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


def _day_label(ts_ms: int) -> str:
    """캔들 timestamp(ms) → 'MM-DD' (KST 일 기준)."""
    return datetime.fromtimestamp(ts_ms / 1000, tz=_KST).strftime("%m-%d")


# 일봉 기반 섹터 누적수익률 — 공용 일봉 캐시(200개) 재사용이라 윈도우도 그에 맞춤.
_DAILY_CUM_CANDLES = 200
_DAILY_CUM_MIN_LEN = 150  # 신규 상장(히스토리 짧은) 코인 제외 → 공통 윈도우가 줄지 않게(대시보드 regime과 동일)


def get_category_daily_cumulative(n_days: int = _DAILY_CUM_CANDLES) -> CategoryReturns:
    """섹터별 일간 동일가중 지수의 누적 등락률(%) — 최근 ~200일 일봉.

    각 섹터 소속 종목의 일봉 close를 윈도우 첫날=1.0으로 정규화해 동일가중 평균(=동일금액 매수·보유 지수),
    누적 등락률 = (지수 − 1)×100. 모든 섹터가 같은 날짜축(공통 윈도우 T)을 공유하도록 전체 종목을
    공통 길이로 맞춘다(min_len 미만 신규 상장은 제외해 T가 줄지 않게). 일봉은 공용 캐시 재사용 → 팬아웃 0.
    (과거 월봉 기반 월/분기/년 집계를 대체 — 일 단위라 호버가 촘촘·부드러움)
    """
    from app.services import quant_service  # 순환 import 방지(지연 로드)

    def build() -> CategoryReturns:
        live = set(market_service.valid_markets())
        members: dict[str, list[str]] = defaultdict(list)
        for market, cat in _CATEGORIES.items():
            if market in live:
                members[cat].append(market)

        all_markets = [m for cat in config.CATEGORY_LIST for m in members.get(cat, [])]
        kept, closes = quant_service.closes_matrix(all_markets, count=n_days, min_len=_DAILY_CUM_MIN_LEN)
        if not kept:
            return CategoryReturns(categories=[], rows=[])
        T = closes.shape[0]
        idx_of = {m: i for i, m in enumerate(kept)}
        norm = closes / closes[0]  # (T, n) — 각 종목 시작=1.0

        # 날짜축 — kept 중 하나의 최근 T개 일봉 timestamp (일봉은 연속이라 종목 무관 동일 날짜)
        ref = "KRW-BTC" if "KRW-BTC" in idx_of else kept[0]
        ref_candles = candle_service.get_candles(ref, "days", count=n_days)[-T:]
        labels = [_day_label(c.timestamp) for c in ref_candles]
        times = [int(c.timestamp // 1000) for c in ref_candles]

        cats: list[str] = []
        series: dict[str, np.ndarray] = {}
        for cat in config.CATEGORY_LIST:
            cols = [idx_of[m] for m in members.get(cat, []) if m in idx_of]
            if not cols:
                continue
            series[cat] = (norm[:, cols].mean(axis=1) - 1.0) * 100
            cats.append(cat)

        rows: list[dict] = []
        for i in range(T):
            row: dict = {"label": labels[i], "t": times[i]}
            for cat in cats:
                row[cat] = round(float(series[cat][i]), 2)
            rows.append(row)
        return CategoryReturns(categories=cats, rows=rows)

    return cached("category:cumulative_daily", config.TTL_CATEGORY, build)


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


# 상관 계산에 필요한 최소 공통 관측 수. 이보다 짧으면(신규 상장 등) 표본이 적어
# 상관계수가 노이즈가 되므로 제외한다(quant returns_matrix의 min_len과 같은 취지).
_CORR_MIN_OVERLAP = 40


def get_correlation(market: str) -> list[CorrelationItem]:
    # 섹터 스냅샷(_CATEGORIES)엔 상폐 코드(예: KRW-DRIFT)가 남아 있을 수 있다 →
    # 라이브 마켓(/market/all 교집합)과 교집합만 순회해 404를 원천 차단한다.
    live = set(market_service.valid_markets())
    all_markets = [m for m in _CATEGORIES.keys() if m != market and m in live]
    base_candles = candle_service.get_candles(market, "days", 60)
    base_closes  = [c.close for c in base_candles]

    ticker_map = {t.market: t for t in market_service.get_tickers()}
    result = []
    for m in all_markets:
        candles = candle_service.get_candles(m, "days", 60)
        closes  = [c.close for c in candles]
        n = min(len(base_closes), len(closes))
        if n < _CORR_MIN_OVERLAP:  # 공통 관측이 너무 적으면 상관 노이즈 → 제외
            continue
        corr = _pearson(base_closes[-n:], closes[-n:])
        t = ticker_map.get(m)
        result.append(CorrelationItem(
            market=m,
            korean_name=t.korean_name if t else m,
            correlation=corr,
        ))
    return sorted(result, key=lambda x: x.correlation, reverse=True)


def _daily_returns(closes: list[float]) -> list[float]:
    """일간 단순수익률 (소수). close가 0/음수인 구간은 건너뛴다."""
    return [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(1, len(closes)) if closes[i - 1]]


def _compute_coin_stats() -> list[CoinStat]:
    # 분석 유니버스 전체를 대상으로 변동성·1개월 수익률·BTC 베타·거래량 급증·변동성 z-score 산출
    # (공용 일봉 캐시 재사용 → BTC 일봉만 1회 추가, 나머지는 캐시 히트).
    # 카테고리는 업비트 섹터 스냅샷에 있으면 부여, 없으면 None (신규 상장 등).
    tickers = market_service.get_tickers()

    # 베타 기준 = BTC 30일 일간수익률 분포 (모분산 ÷n)
    btc_candles = candle_service.get_candles("KRW-BTC", "days", count=30)
    btc_rets = _daily_returns([c.close for c in btc_candles])
    btc_mean = sum(btc_rets) / len(btc_rets) if btc_rets else 0.0
    btc_var = sum((r - btc_mean) ** 2 for r in btc_rets) / len(btc_rets) if btc_rets else 0.0

    # 1패스 — 종목별 지표 계산 (z-score는 전종목 분포가 필요해 2패스로 뒤에서)
    rows: list[tuple] = []
    for t in tickers:
        candles = candle_service.get_candles(t.market, "days", count=30)
        closes = [c.close for c in candles]
        volumes = [c.volume for c in candles]
        volatility = _volatility(t.market)
        return_1m = _return_1m(t.market)

        # BTC 베타 = cov(종목, BTC) / var(BTC) — 공통 최근 구간으로 정렬
        rets = _daily_returns(closes)
        n = min(len(rets), len(btc_rets))
        if n >= 5 and btc_var > 0:
            sr, br = rets[-n:], btc_rets[-n:]
            sm, bm = sum(sr) / n, sum(br) / n
            cov = sum((sr[i] - sm) * (br[i] - bm) for i in range(n)) / n
            beta = round(cov / btc_var, 2)
        else:
            beta = 0.0

        # 거래량 급증 = 최신 일봉 거래량 / 직전 7일 평균
        if len(volumes) >= 8:
            avg7 = sum(volumes[-8:-1]) / 7
            surge = round(volumes[-1] / avg7, 2) if avg7 > 0 else 0.0
        else:
            surge = 0.0

        rows.append((t, volatility, return_1m, beta, surge))

    # 2패스 — 전종목 변동성 분포로 z-score
    vols_all = [v for _, v, _, _, _ in rows if v > 0]
    if len(vols_all) >= 2:
        vmean = sum(vols_all) / len(vols_all)
        vstd = math.sqrt(sum((v - vmean) ** 2 for v in vols_all) / (len(vols_all) - 1))
    else:
        vmean, vstd = 0.0, 0.0

    result = []
    for t, volatility, return_1m, beta, surge in rows:
        zscore = round((volatility - vmean) / vstd, 2) if vstd > 0 else 0.0
        result.append(CoinStat(
            market=t.market,
            korean_name=t.korean_name,
            category=_CATEGORIES.get(t.market),
            volatility=volatility,
            return_1m=return_1m,
            acc_trade_price_24h=t.acc_trade_price_24h,
            btc_beta=beta,
            vol_zscore=zscore,
            vol_surge=surge,
        ))
    return result


def get_coin_stats() -> list[CoinStat]:
    # 전체 유니버스면 코인 수가 많아 계산 비용이 커지므로 짧게 캐시한다.
    return cached("coin_stats", config.TTL_TICKER, _compute_coin_stats)


# ── Advance-Decline 라인 (시장 폭의 추세) ──────────────────────
# 거래대금 상위 N종으로 매일 (상승−하락) 종목 수를 누적. 일봉은 공용 캐시 재사용 → 팬아웃 0.
_AD_TOP = 100        # 메이저+준메이저. 전 종목은 유동성 낮은 잡코인 노이즈가 큼
_AD_CANDLES = 100    # 공용 일봉 캐시(200) 범위 내
_AD_MIN_LEN = 60     # 히스토리 짧은 신규 상장 제외 → 공통 윈도우 보존


def get_advance_decline() -> AdvanceDeclineResult:
    from app.services import quant_service  # 순환 import 방지(지연 로드)

    def build() -> AdvanceDeclineResult:
        tickers = market_service.get_tickers()[:_AD_TOP]
        markets = [t.market for t in tickers]
        kept, closes = quant_service.closes_matrix(markets, count=_AD_CANDLES, min_len=_AD_MIN_LEN)
        if len(kept) < 5:
            return AdvanceDeclineResult(points=[], n=0, n_obs=0)

        r = closes[1:] / closes[:-1] - 1.0          # (T-1, n) 일간 단순수익률
        advancers = (r > 0).sum(axis=1)             # 그날 상승 종목 수
        decliners = (r < 0).sum(axis=1)             # 그날 하락 종목 수
        ad_line = np.cumsum(advancers - decliners)  # 누적 시장 폭
        index = 100 * np.cumprod(1 + r.mean(axis=1))  # 동일가중 시장지수(첫날 100 대비)

        # 날짜축 — 수익률은 첫 캔들을 잃으므로 [1:]. 일봉은 연속이라 종목 무관 동일 날짜.
        T = closes.shape[0]
        ref = "KRW-BTC" if "KRW-BTC" in kept else kept[0]
        ref_candles = candle_service.get_candles(ref, "days", count=_AD_CANDLES)[-T:]
        times = [int(c.timestamp // 1000) for c in ref_candles][1:]

        points = [
            AdvanceDeclinePoint(
                time=t, ad_line=int(ad), advancers=int(a), decliners=int(d),
                index=round(float(ix), 2),
            )
            for t, ad, a, d, ix in zip(times, ad_line, advancers, decliners, index)
        ]
        return AdvanceDeclineResult(points=points, n=len(kept), n_obs=int(r.shape[0]))

    return cached("advance_decline", config.TTL_CANDLE_DAYS, build)
