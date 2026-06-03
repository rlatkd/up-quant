"""퀀트/ML 분석 공용 기반.

모든 퀀트 기능(포트폴리오·상관 네트워크·PCA·클러스터링·GARCH·모멘텀·공적분·HMM)이
공유하는 '수익률 행렬'을 한 곳에서 만든다. 일봉은 candle_service의 공용 캐시
(종목당 200개를 1회 fetch해 캐시)를 재사용하므로 추가 팬아웃이 없다 — 계산만 든다.
(성능 원칙: 대량 팬아웃은 부팅 프리페치에서 1회, 이후 클라이언트는 캐시 히트)

분석 레이어는 numpy/scipy/sklearn/statsmodels/arch/networkx 등 표준 라이브러리를 사용한다.
(직접 구현 정체성은 캐시·로깅·API 클라이언트 계층에 있고, 통계/ML은 검증된 모델을 쓴다.)
"""
import warnings

import networkx as nx
import numpy as np
import statsmodels.api as sm
from arch import arch_model
from hmmlearn.hmm import GaussianHMM
from scipy.cluster.hierarchy import dendrogram, linkage
from scipy.optimize import minimize
from scipy.spatial.distance import squareform
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from statsmodels.tsa.stattools import coint

from app.core import config
from app.core.cache import cached
from app.schemas.quant import (
    AssetPoint,
    ClusterPoint,
    ClusterResult,
    CointPair,
    DendrogramResult,
    GarchResult,
    MomentumEquityPoint,
    MomentumHolding,
    MomentumResult,
    NetworkEdge,
    NetworkNode,
    NetworkResult,
    PairsResult,
    RegimePoint,
    RegimeResult,
    RegimeStat,
    PCAComponent,
    PCALoading,
    PCAResult,
    PortfolioPoint,
    PortfolioResult,
    PortfolioSpot,
    PortfolioWeight,
    VolPoint,
)
from app.services import analysis_service, candle_service, market_service

# 암호화폐는 연중무휴(365일) 거래 → 일간 통계의 연율화 기준.
TRADING_DAYS = 365


def name_map() -> dict[str, str]:
    """market → 한글명. (티커는 짧은 TTL 캐시라 호출 저렴)"""
    return {t.market: t.korean_name for t in market_service.get_tickers()}


def closes_matrix(markets: list[str], count: int = 120, min_len: int = 5) -> tuple[list[str], np.ndarray]:
    """종목별 일봉 close를 공통 길이로 맞춘 (T, n) 행렬 + 유효 종목 리스트.

    - close 개수가 min_len 미만이거나 0/음수 close가 있는 종목은 제외.
      (min_len을 키우면 신규 상장 코인을 버려 공통 윈도우가 짧아지는 것을 막는다 —
       다종목 상관/공분산처럼 긴 윈도우가 필요한 분석에서 사용)
    - 남은 종목 중 가장 짧은 종목 기준(최근 T개)으로 정렬한다.
    반환: (kept_markets, closes(T,n))  — 유효 종목이 없으면 ([], 빈 배열).
    """
    series: dict[str, np.ndarray] = {}
    for m in markets:
        candles = candle_service.get_candles(m, "days", count=count)
        closes = np.array([c.close for c in candles], dtype=float)
        if closes.size >= min_len and np.all(closes > 0):
            series[m] = closes
    kept = [m for m in markets if m in series]
    if not kept:
        return [], np.empty((0, 0))
    t = min(series[m].size for m in kept)
    mat = np.column_stack([series[m][-t:] for m in kept])  # (T, n)
    return kept, mat


def returns_matrix(markets: list[str], count: int = 120, kind: str = "simple",
                   min_len: int = 5) -> tuple[list[str], np.ndarray]:
    """일간 수익률 행렬 (T-1, n) + 유효 종목.

    kind="simple": 단순수익률 (포트폴리오·상관·공분산 표준)
    kind="log":    로그수익률 (GARCH·정규성 가정 모델)
    min_len: 이보다 짧은 히스토리 종목은 제외(짧은 신규 코인이 공통 윈도우를 갉아먹는 것 방지).
    """
    kept, closes = closes_matrix(markets, count, min_len=min_len)
    if not kept:
        return [], np.empty((0, 0))
    if kind == "log":
        r = np.diff(np.log(closes), axis=0)
    else:
        r = closes[1:] / closes[:-1] - 1.0
    return kept, r


# ── 1) 포트폴리오 최적화 (Markowitz 효율적 경계선) ──────────────
# 무위험수익률 0 가정. 연율화: 기대수익 ×365, 공분산 ×365 (변동성은 √365 효과).
_N_SIM = 1000           # 무작위 가중 시뮬 개수
_PORT_CANDLES = 120     # 공분산 추정 윈도우 (일봉 120개)


def _spot(w: np.ndarray, mu: np.ndarray, cov: np.ndarray,
          kept: list[str], nmap: dict[str, str]) -> PortfolioSpot:
    r = float(w @ mu)
    v = float(np.sqrt(max(w @ cov @ w, 0.0)))
    return PortfolioSpot(
        vol=round(v * 100, 2),
        ret=round(r * 100, 2),
        sharpe=round(r / v, 3) if v else 0.0,
        weights=[
            PortfolioWeight(market=m, korean_name=nmap.get(m, m), weight=round(float(wi), 4))
            for m, wi in zip(kept, w)
        ],
    )


def _empty_spot() -> PortfolioSpot:
    return PortfolioSpot(vol=0.0, ret=0.0, sharpe=0.0, weights=[])


def _compute_portfolio(markets: list[str]) -> PortfolioResult:
    kept, r = returns_matrix(markets, count=_PORT_CANDLES, kind="simple")
    if len(kept) < 2:
        return PortfolioResult(
            points=[], max_sharpe=_empty_spot(), min_vol=_empty_spot(), assets=[], n_obs=0,
        )
    nmap = name_map()
    n = len(kept)
    mu = r.mean(axis=0) * TRADING_DAYS                 # 연율 기대수익 (소수)
    cov = np.cov(r, rowvar=False) * TRADING_DAYS       # 연율 공분산 (n,n)
    cov = np.atleast_2d(cov)

    # 무작위 가중 1000개 — Dirichlet(1,…,1) = 심플렉스 균등(long-only, 합=1).
    rng = np.random.default_rng(abs(hash(tuple(kept))) % (2**32))
    w_sim = rng.dirichlet(np.ones(n), size=_N_SIM)     # (N, n)
    sim_ret = w_sim @ mu                               # (N,)
    sim_var = np.einsum("ij,jk,ik->i", w_sim, cov, w_sim)
    sim_vol = np.sqrt(np.clip(sim_var, 0, None))
    sim_sharpe = np.divide(sim_ret, sim_vol, out=np.zeros_like(sim_ret), where=sim_vol > 0)
    points = [
        PortfolioPoint(vol=round(v * 100, 2), ret=round(rr * 100, 2), sharpe=round(s, 3))
        for v, rr, s in zip(sim_vol, sim_ret, sim_sharpe)
    ]

    # long-only 제약 최적화(scipy SLSQP): 합=1, 0≤w≤1.
    cons = ({"type": "eq", "fun": lambda w: w.sum() - 1.0},)
    bnds = tuple((0.0, 1.0) for _ in range(n))
    w0 = np.ones(n) / n

    def neg_sharpe(w):
        v = np.sqrt(max(w @ cov @ w, 1e-12))
        return -(w @ mu) / v

    def variance(w):
        return w @ cov @ w

    res_ms = minimize(neg_sharpe, w0, method="SLSQP", bounds=bnds, constraints=cons)
    res_mv = minimize(variance, w0, method="SLSQP", bounds=bnds, constraints=cons)
    # 최적화 실패 시 시뮬 최선값으로 폴백.
    w_ms = res_ms.x if res_ms.success else w_sim[int(np.argmax(sim_sharpe))]
    w_mv = res_mv.x if res_mv.success else w_sim[int(np.argmin(sim_vol))]

    assets = [
        AssetPoint(
            market=m, korean_name=nmap.get(m, m),
            vol=round(float(np.sqrt(max(cov[i, i], 0.0))) * 100, 2),
            ret=round(float(mu[i]) * 100, 2),
        )
        for i, m in enumerate(kept)
    ]

    return PortfolioResult(
        points=points,
        max_sharpe=_spot(w_ms, mu, cov, kept, nmap),
        min_vol=_spot(w_mv, mu, cov, kept, nmap),
        assets=assets,
        n_obs=int(r.shape[0]),
    )


def get_portfolio(markets: list[str]) -> PortfolioResult:
    """2~8종목 포트폴리오 효율적 경계선. 일봉은 공용 캐시 재사용이라 계산만 들지만,
    같은 종목셋 반복 요청 대비 짧게 캐시한다."""
    uniq = list(dict.fromkeys(markets))
    cache_key = "quant:portfolio:" + ",".join(sorted(uniq))
    return cached(cache_key, config.TTL_CANDLE_DAYS, lambda: _compute_portfolio(uniq))


# ── 2) 상관 네트워크 (Mantegna 최소신장트리) ───────────────────
# Mantegna(1999): 상관 ρ를 거리 d=√(2(1−ρ))로 변환하면(메트릭) MST가 "종목 간 위계 구조"를
# 드러낸다. 거래대금 상위 N종에 대해 일간수익률 상관 → 거리 → MST → 허브(중심 종목) 파악.
_NET_TOP = 50
_NET_CANDLES = 120
_NET_MIN_LEN = 90       # 상관 추정 안정화 — 히스토리 90일 미만(신규 상장)은 제외


def _compute_network(top: int) -> NetworkResult:
    tickers = market_service.get_tickers()[:top]
    markets = [t.market for t in tickers]
    kept, r = returns_matrix(markets, count=_NET_CANDLES, kind="simple", min_len=_NET_MIN_LEN)
    if len(kept) < 3:
        return NetworkResult(nodes=[], edges=[], n_obs=0)

    corr = np.corrcoef(r, rowvar=False)
    dist = np.sqrt(np.clip(2.0 * (1.0 - corr), 0, None))  # Mantegna 거리(메트릭)

    # 완전그래프(거리 가중) → 최소신장트리. n=50이면 간선 1225개라 부담 없음.
    g = nx.Graph()
    n = len(kept)
    for i in range(n):
        for j in range(i + 1, n):
            g.add_edge(kept[i], kept[j], weight=float(dist[i, j]), corr=float(corr[i, j]))
    mst = nx.minimum_spanning_tree(g, weight="weight")

    degree = dict(mst.degree())
    edges = [
        NetworkEdge(source=u, target=v, corr=round(d["corr"], 3))
        for u, v, d in mst.edges(data=True)
    ]
    nmap = name_map()
    cats = config.MARKET_CATEGORIES
    vol_map = {t.market: t.acc_trade_price_24h for t in tickers}
    nodes = [
        NetworkNode(
            market=m, korean_name=nmap.get(m, m),
            category=cats.get(m), value=vol_map.get(m, 0.0), degree=degree.get(m, 0),
        )
        for m in kept
    ]
    return NetworkResult(nodes=nodes, edges=edges, n_obs=int(r.shape[0]))


def get_network(top: int = _NET_TOP) -> NetworkResult:
    top = max(5, min(top, 100))
    return cached(f"quant:network:{top}", config.TTL_CANDLE_DAYS, lambda: _compute_network(top))


# ── 3) PCA 시장 요인 분석 ──────────────────────────────────────
# 표준화된 일간수익률에 PCA → 제1주성분 = "공통 시장 요인". 설명비율이 높을수록 시장이
# 한 덩어리로 움직였다는 뜻(동조화). 종목별 PC1 로딩 = 시장요인 동조도(≈베타).
_PCA_TOP = 50
_PCA_CANDLES = 120
_PCA_MIN_LEN = 90


def _compute_pca(top: int) -> PCAResult:
    tickers = market_service.get_tickers()[:top]
    markets = [t.market for t in tickers]
    kept, r = returns_matrix(markets, count=_PCA_CANDLES, kind="simple", min_len=_PCA_MIN_LEN)
    if len(kept) < 3:
        return PCAResult(components=[], loadings=[], pc1_explained=0.0, n_obs=0)

    x = StandardScaler().fit_transform(r)             # 종목별 단위분산 표준화 → 상관 기반 PCA
    k = min(10, len(kept))
    pca = PCA(n_components=k).fit(x)
    evr = pca.explained_variance_ratio_               # (k,)
    # 로딩 = 고유벡터 × √고유값 → 표준화 데이터에선 변수-성분 상관(-1~1, 해석 용이).
    load = pca.components_.T * np.sqrt(pca.explained_variance_)  # (n, k)
    pc1 = load[:, 0].copy()
    pc2 = load[:, 1].copy() if k > 1 else np.zeros(len(kept))
    # PCA 부호는 임의 → PC1은 평균이 양수가 되도록 정렬(시장요인 = 모두 같이 오름).
    if pc1.mean() < 0:
        pc1 = -pc1

    nmap = name_map()
    cats = config.MARKET_CATEGORIES
    components = [PCAComponent(index=i + 1, explained=round(float(evr[i]) * 100, 2)) for i in range(k)]
    loadings = [
        PCALoading(
            market=m, korean_name=nmap.get(m, m), category=cats.get(m),
            pc1=round(float(pc1[i]), 3), pc2=round(float(pc2[i]), 3),
        )
        for i, m in enumerate(kept)
    ]
    return PCAResult(
        components=components, loadings=loadings,
        pc1_explained=round(float(evr[0]) * 100, 2), n_obs=int(r.shape[0]),
    )


def get_pca(top: int = _PCA_TOP) -> PCAResult:
    top = max(5, min(top, 100))
    return cached(f"quant:pca:{top}", config.TTL_CANDLE_DAYS, lambda: _compute_pca(top))


# ── 4a) K-means 군집 (변동성·수익률·거래대금) ──────────────────
# 업비트 섹터(테마)와 무관하게 "통계적 성격"으로 종목을 묶는다. 특징 3개를 표준화 후 K-means.
_KM_TOP = 80
_KM_K = 4


def _compute_clusters(top: int, k: int) -> ClusterResult:
    stats = analysis_service.get_coin_stats()[:top]
    stats = [s for s in stats if s.acc_trade_price_24h > 0]
    if len(stats) < k:
        return ClusterResult(points=[], k=k, n=0)

    cats = config.MARKET_CATEGORIES
    feat = np.array([[s.volatility, s.return_1m, np.log10(s.acc_trade_price_24h)] for s in stats])
    x = StandardScaler().fit_transform(feat)
    labels = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(x)

    points = [
        ClusterPoint(
            market=s.market, korean_name=s.korean_name, category=cats.get(s.market),
            cluster=int(labels[i]),
            volatility=round(float(s.volatility), 2),
            return_1m=round(float(s.return_1m), 2),
            log_value=round(float(np.log10(s.acc_trade_price_24h)), 2),
        )
        for i, s in enumerate(stats)
    ]
    return ClusterResult(points=points, k=k, n=len(points))


def get_clusters(top: int = _KM_TOP, k: int = _KM_K) -> ClusterResult:
    top = max(10, min(top, 150))
    k = max(2, min(k, 8))
    return cached(f"quant:clusters:{top}:{k}", config.TTL_CANDLE_DAYS, lambda: _compute_clusters(top, k))


# ── 4b) 계층적 클러스터링 덴드로그램 (상관 거리 기반) ──────────
# Mantegna 거리 행렬에 평균연결(average linkage) → 종목 위계 트리. scipy dendrogram 좌표를
# 그대로 반환해 프론트가 SVG로 렌더한다.
_DEN_TOP = 40
_DEN_CANDLES = 120
_DEN_MIN_LEN = 90


def _compute_dendrogram(top: int) -> DendrogramResult:
    tickers = market_service.get_tickers()[:top]
    markets = [t.market for t in tickers]
    kept, r = returns_matrix(markets, count=_DEN_CANDLES, kind="simple", min_len=_DEN_MIN_LEN)
    if len(kept) < 3:
        return DendrogramResult(icoord=[], dcoord=[], labels=[], markets=[], categories=[], n_obs=0)

    corr = np.corrcoef(r, rowvar=False)
    dist = np.sqrt(np.clip(2.0 * (1.0 - corr), 0, None))
    np.fill_diagonal(dist, 0.0)
    condensed = squareform(dist, checks=False)        # 상삼각 → 압축 거리벡터
    z = linkage(condensed, method="average")
    nmap = name_map()
    cats = config.MARKET_CATEGORIES
    short = [m.replace("KRW-", "") for m in kept]
    dn = dendrogram(z, labels=short, no_plot=True)

    order = dn["leaves"]                              # 플롯 순서의 잎 인덱스
    return DendrogramResult(
        icoord=dn["icoord"], dcoord=dn["dcoord"], labels=dn["ivl"],
        markets=[kept[i] for i in order],
        categories=[cats.get(kept[i]) for i in order],
        n_obs=int(r.shape[0]),
    )


def get_dendrogram(top: int = _DEN_TOP) -> DendrogramResult:
    top = max(5, min(top, 60))
    return cached(f"quant:dendrogram:{top}", config.TTL_CANDLE_DAYS, lambda: _compute_dendrogram(top))


# ── 5) GARCH(1,1) 변동성 예측 + VaR ────────────────────────────
# 가격이 아니라 '변동성'을 예측한다(변동성 군집성 = 큰 변동 뒤 큰 변동). arch 라이브러리로
# GARCH(1,1) MLE 적합 → 조건부 변동성 시계열 + 향후 N일 예측 + 1일 95% VaR.
_GARCH_CANDLES = 200    # 적합 안정화를 위해 길게(공용 일봉 캐시 최대)
_GARCH_HORIZON = 10     # 예측 일수
_Z_95 = 1.645           # 표준정규 95% 분위


def _compute_garch(market: str) -> GarchResult:
    candles = candle_service.get_candles(market, "days", count=_GARCH_CANDLES)
    nmap = name_map()
    name = nmap.get(market, market)
    closes = np.array([c.close for c in candles], dtype=float)
    times = [int(c.timestamp / 1000) for c in candles]
    if closes.size < 50 or np.any(closes <= 0):
        return GarchResult(market=market, korean_name=name, cond_vol=[], forecast_vol=[],
                           current_vol_annual=0.0, var_95=0.0, persistence=0.0, n_obs=0)

    # 로그수익률(%) — arch는 퍼센트 스케일을 권장.
    ret = np.diff(np.log(closes)) * 100.0
    am = arch_model(ret, mean="Constant", vol="GARCH", p=1, q=1, dist="normal")
    res = am.fit(disp="off")

    cond = res.conditional_volatility            # 인샘플 일간 변동성(%)
    cond_times = times[1:]                        # 수익률은 첫 캔들 제외
    cond_vol = [VolPoint(time=t, vol=round(float(v), 3)) for t, v in zip(cond_times, cond)]

    fc = res.forecast(horizon=_GARCH_HORIZON, reindex=False)
    fc_vol = np.sqrt(fc.variance.values[-1])      # (H,) 일간 변동성 예측(%)
    forecast_vol = [round(float(v), 3) for v in fc_vol]

    mu = float(res.params.get("mu", 0.0))
    sigma1 = float(fc_vol[0])                      # 1일 예측 변동성(%)
    var_95 = round(max(_Z_95 * sigma1 - mu, 0.0), 3)  # 1일 95% VaR(손실 %)

    p = res.params
    persistence = round(float(p.get("alpha[1]", 0.0)) + float(p.get("beta[1]", 0.0)), 4)
    current_vol_annual = round(float(cond[-1]) * np.sqrt(TRADING_DAYS), 2)

    return GarchResult(
        market=market, korean_name=name,
        cond_vol=cond_vol, forecast_vol=forecast_vol,
        current_vol_annual=current_vol_annual, var_95=var_95,
        persistence=persistence, n_obs=int(ret.size),
    )


def get_garch(market: str) -> GarchResult:
    return cached(f"quant:garch:{market}", config.TTL_CANDLE_DAYS, lambda: _compute_garch(market))


# ── 6) 횡단면 모멘텀 팩터 백테스트 ─────────────────────────────
# "최근 많이 오른 종목이 계속 오른다"(모멘텀)를 검증. 매 리밸런스마다 과거 lookback일
# 수익률로 랭킹 → 상위 분위 롱·하위 분위 숏(달러중립). 동일가중 매수보유를 벤치마크로.
_MOM_TOP = 40
_MOM_CANDLES = 200
_MOM_MIN_LEN = 150
_MOM_LOOKBACK = 20
_MOM_HOLDING = 5
_MOM_Q = 0.2            # 상·하위 20%
_MOM_FEE_BPS = 5.0     # 편도 거래비용(bps) — 매 리밸런스 롱·숏 회전에 차감(업비트 ~0.05%)


def _mdd(equity: np.ndarray) -> float:
    peak = np.maximum.accumulate(equity)
    return float((np.min((equity - peak) / peak)) * 100)


def _compute_momentum(top: int, lookback: int, holding: int) -> MomentumResult:
    tickers = market_service.get_tickers()[:top]
    markets = [t.market for t in tickers]
    kept, closes = closes_matrix(markets, count=_MOM_CANDLES, min_len=_MOM_MIN_LEN)  # (T, n)
    empty = MomentumResult(equity=[], total_return=0.0, benchmark_return=0.0, sharpe=0.0,
                           mdd=0.0, long=[], short=[], lookback=lookback, holding=holding, n=0)
    if len(kept) < 10:
        return empty
    t_len, n = closes.shape
    if t_len <= lookback + holding:
        return empty

    base_candles = candle_service.get_candles(kept[0], "days", count=_MOM_CANDLES)
    times = [int(c.timestamp / 1000) for c in base_candles][-t_len:]
    nq = max(1, int(n * _MOM_Q))

    # 매 리밸런스마다 롱·숏 분위를 새로 구성 → 롱 1.0 + 숏 1.0 = 총 2.0 명목을 회전시킨다고 보고
    # 편도 거래비용을 2×fee로 근사 차감(전량 회전 가정). 거래비용 없이는 모멘텀이 과대평가됨.
    fee = _MOM_FEE_BPS / 10000.0
    rebal_cost = 2 * fee
    eq_f, eq_b, eq_t, rebal = [100.0], [100.0], [times[lookback]], []
    t = lookback
    while t + holding < t_len:
        trail = closes[t] / closes[t - lookback] - 1.0
        order = np.argsort(trail)
        longs, shorts = order[-nq:], order[:nq]
        fwd = closes[t + holding] / closes[t] - 1.0
        ls_r = float(fwd[longs].mean() - fwd[shorts].mean()) - rebal_cost   # 달러중립 롱숏(거래비용 차감)
        bench_r = float(fwd.mean())
        eq_f.append(eq_f[-1] * (1 + ls_r))
        eq_b.append(eq_b[-1] * (1 + bench_r))
        eq_t.append(times[t + holding])
        rebal.append(ls_r)
        t += holding

    equity = [
        MomentumEquityPoint(time=tt, factor=round(f, 2), benchmark=round(b, 2))
        for tt, f, b in zip(eq_t, eq_f, eq_b)
    ]
    rebal_arr = np.array(rebal)
    ppy = TRADING_DAYS / holding
    sharpe = (
        round(float(rebal_arr.mean() / rebal_arr.std() * np.sqrt(ppy)), 3)
        if rebal_arr.size > 1 and rebal_arr.std() > 0 else 0.0
    )

    # 현재(최신) 랭킹으로 롱/숏 종목 구성.
    nmap, cats = name_map(), config.MARKET_CATEGORIES
    trail_now = closes[-1] / closes[-1 - lookback] - 1.0
    order_now = np.argsort(trail_now)
    long_idx = order_now[-nq:][::-1]
    short_idx = order_now[:nq]

    def _hold(idx, leg):
        return [
            MomentumHolding(
                market=kept[i], korean_name=nmap.get(kept[i], kept[i]),
                category=cats.get(kept[i]), momentum=round(float(trail_now[i]) * 100, 2), leg=leg,
            )
            for i in idx
        ]

    return MomentumResult(
        equity=equity,
        total_return=round(eq_f[-1] - 100, 2),
        benchmark_return=round(eq_b[-1] - 100, 2),
        sharpe=sharpe,
        mdd=round(_mdd(np.array(eq_f)), 2),
        long=_hold(long_idx, "LONG"),
        short=_hold(short_idx, "SHORT"),
        lookback=lookback, holding=holding, n=n,
        fee_bps=_MOM_FEE_BPS,
    )


def get_momentum(top: int = _MOM_TOP, lookback: int = _MOM_LOOKBACK,
                 holding: int = _MOM_HOLDING) -> MomentumResult:
    top = max(10, min(top, 100))
    lookback = max(5, min(lookback, 60))
    holding = max(1, min(holding, 20))
    key = f"quant:momentum:{top}:{lookback}:{holding}"
    return cached(key, config.TTL_CANDLE_DAYS, lambda: _compute_momentum(top, lookback, holding))


# ── 7) 공적분 페어트레이딩 스크리너 ───────────────────────────
# 두 종목의 로그가격이 장기적으로 같이 움직이면(공적분) 스프레드가 평균회귀한다. 상관 높은
# 페어만 Engle-Granger 공적분 검정 → p<0.05면 채택, OLS 헤지비율로 스프레드 z점수 → 진입신호.
_PAIR_TOP = 50          # 거래대금 상위 30은 메이저뿐 → 서로 상관만 높고 공적분 X. 동일생태계
                        # 중캡(HBAR·HIVE·ENA 등)이 들어오도록 유니버스를 넓혀야 페어가 검출됨.
_PAIR_CANDLES = 150
_PAIR_MIN_LEN = 120
_PAIR_CORR_GATE = 0.5     # 이 이상 상관인 페어만 검정(연산 절감 + 무의미 페어 제외)
_PAIR_PVAL = 0.05
_PAIR_Z = 2.0             # |z|>2 진입


def _compute_pairs(top: int) -> PairsResult:
    tickers = market_service.get_tickers()[:top]
    markets = [t.market for t in tickers]
    kept, closes = closes_matrix(markets, count=_PAIR_CANDLES, min_len=_PAIR_MIN_LEN)
    if len(kept) < 3:
        return PairsResult(pairs=[], tested=0, found=0, n_obs=0)

    logp = np.log(closes)                                   # 공적분은 로그가격(레벨)에
    dcorr = np.corrcoef(np.diff(logp, axis=0), rowvar=False)  # 수익률 상관(게이트용)
    nmap = name_map()
    n = len(kept)
    rows: list[CointPair] = []
    tested = 0
    for i in range(n):
        for j in range(i + 1, n):
            if abs(dcorr[i, j]) < _PAIR_CORR_GATE:
                continue
            tested += 1
            s1, s2 = logp[:, i], logp[:, j]
            try:
                _, pval, _ = coint(s1, s2)
            except Exception:
                continue
            if pval > _PAIR_PVAL:
                continue
            beta = sm.OLS(s1, sm.add_constant(s2)).fit().params  # [α, β]
            spread = s1 - (beta[0] + beta[1] * s2)
            sd = spread.std()
            z = float((spread[-1] - spread.mean()) / sd) if sd else 0.0
            signal = "LONG_SPREAD" if z < -_PAIR_Z else "SHORT_SPREAD" if z > _PAIR_Z else "NEUTRAL"
            rows.append(CointPair(
                market1=kept[i], korean_name1=nmap.get(kept[i], kept[i]),
                market2=kept[j], korean_name2=nmap.get(kept[j], kept[j]),
                pvalue=round(float(pval), 4), correlation=round(float(dcorr[i, j]), 3),
                hedge_ratio=round(float(beta[1]), 3), zscore=round(z, 2), signal=signal,
            ))
    rows.sort(key=lambda p: p.pvalue)
    return PairsResult(pairs=rows[:25], tested=tested, found=len(rows), n_obs=int(closes.shape[0]))


def get_pairs(top: int = _PAIR_TOP) -> PairsResult:
    top = max(5, min(top, 80))
    return cached(f"quant:pairs:{top}", config.TTL_CANDLE_DAYS, lambda: _compute_pairs(top))


# ── 8) HMM 시장 국면(regime) 탐지 ─────────────────────────────
# 동일가중 시장지수의 일간수익률에 가우시안 HMM 적합 → 숨은 상태(강세·약세 등)를 추정.
# 변동성 군집성·국면 전환을 데이터가 스스로 나눈다. 상태는 평균수익률 오름차순으로 정렬해
# 0=가장 약세로 라벨 안정화.
_REGIME_TOP = 30
_REGIME_CANDLES = 200
_REGIME_MIN_LEN = 150
# 기본 2국면(평온/격동) — [수익률,변동성] 피처로 실측 시 가장 균형·지속적(161/38일·전환9).
# 3국면은 이 데이터에서 한 국면이 94% 차지하며 퇴화 → 기본 2, 옵션 2~4.
_REGIME_STATES = 2
_REGIME_VOL_WIN = 10      # 롤링 변동성 윈도우(일) — 국면 지속성 부여


def _rolling_std(a: np.ndarray, win: int) -> np.ndarray:
    """길이 보존 롤링 표준편차(앞쪽은 가용 구간으로). 군집성 피처 생성용."""
    out = np.empty(a.size)
    for i in range(a.size):
        lo = max(0, i - win + 1)
        seg = a[lo:i + 1]
        out[i] = seg.std() if seg.size > 1 else 0.0
    return out

_REGIME_LABELS = {
    2: ["약세", "강세"],
    3: ["약세", "중립", "강세"],
    4: ["급락", "약세", "강세", "급등"],
}


def _compute_regime(n_states: int) -> RegimeResult:
    tickers = market_service.get_tickers()[:_REGIME_TOP]
    markets = [t.market for t in tickers]
    kept, closes = closes_matrix(markets, count=_REGIME_CANDLES, min_len=_REGIME_MIN_LEN)
    empty = RegimeResult(points=[], stats=[], current_regime=0, current_label="", n_states=n_states, n_obs=0)
    if len(kept) < 5:
        return empty

    # 동일가중 시장 일간수익률(소수).
    mkt_ret = (closes[1:] / closes[:-1] - 1.0).mean(axis=1)        # (T-1,)
    base_candles = candle_service.get_candles(kept[0], "days", count=_REGIME_CANDLES)
    times = [int(c.timestamp / 1000) for c in base_candles][-closes.shape[0]:][1:]

    # 피처 = [수익률, 롤링 변동성]. 변동성은 군집성이 있어 국면이 지속(persistence)되게 한다.
    # (수익률만 쓰면 분산만 다른 상태로 매일 튀어 국면 의미가 사라짐 — 실측됨)
    ret_pct = mkt_ret * 100
    roll_vol = _rolling_std(ret_pct, _REGIME_VOL_WIN)
    feat = np.column_stack([ret_pct, roll_vol])
    x = StandardScaler().fit_transform(feat)                       # 두 피처 스케일 균형

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = GaussianHMM(n_components=n_states, covariance_type="diag",
                            n_iter=300, random_state=42)
        model.fit(x)
        raw_states = model.predict(x)

    # 상태를 평균수익률 오름차순으로 재라벨(0=가장 약세) → 표시 안정.
    # (means_는 표준화 2D 피처 공간이지만 0열=수익률 축이라 그 순위로 정렬)
    means = model.means_[:, 0]
    order = np.argsort(means)                                     # old_state 정렬
    remap = {old: new for new, old in enumerate(order)}
    states = np.array([remap[s] for s in raw_states])

    labels = _REGIME_LABELS.get(n_states, [str(i) for i in range(n_states)])
    # 시장지수(누적, 100 시작).
    index = 100 * np.cumprod(1 + mkt_ret)
    points = [
        RegimePoint(time=t, regime=int(s), index=round(float(v), 2))
        for t, s, v in zip(times, states, index)
    ]

    stats = []
    total = len(states)
    for new in range(n_states):
        mask = states == new
        days = int(mask.sum())
        seg = mkt_ret[mask] * 100
        stats.append(RegimeStat(
            regime=new, label=labels[new],
            mean_return=round(float(seg.mean()), 3) if days else 0.0,
            volatility=round(float(seg.std()), 3) if days > 1 else 0.0,
            days=days, share=round(days / total * 100, 1) if total else 0.0,
        ))

    cur = int(states[-1])
    return RegimeResult(
        points=points, stats=stats, current_regime=cur, current_label=labels[cur],
        n_states=n_states, n_obs=int(total),
    )


def get_regime(n_states: int = _REGIME_STATES) -> RegimeResult:
    n_states = max(2, min(n_states, 4))
    return cached(f"quant:regime:{n_states}", config.TTL_CANDLE_DAYS, lambda: _compute_regime(n_states))
