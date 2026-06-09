import hashlib
import math
from statistics import mean, pstdev

import numpy as np

from app.schemas.backtest import (
    AssetContribution,
    BacktestMetrics,
    BacktestResult,
    EquityPoint,
    MonteCarloPoint,
    MonteCarloResult,
    PortfolioBacktestPoint,
    PortfolioBacktestResult,
    StrategyCompareResult,
    StrategyCurve,
    TradeRecord,
    TsmomEquityPoint,
    TsmomHolding,
    TsmomResult,
    WalkForwardFold,
    WalkForwardResult,
)
from app.services import candle_service, market_service

# 암호화폐는 365일 거래 → 일별 수익률을 √365로 연율화 (전통 주식은 √252)
_ANNUALIZE_SQRT = math.sqrt(365)
_ANNUALIZE_DAYS = 365


def _sma(prices: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * (period - 1)
    for i in range(period - 1, len(prices)):
        result.append(sum(prices[i - period + 1:i + 1]) / period)
    return result


def _rsi(prices: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = [None] * period
    for i in range(period, len(prices)):
        window = prices[i - period:i]
        gains = [max(0, window[j] - window[j - 1]) for j in range(1, len(window))]
        losses = [max(0, window[j - 1] - window[j]) for j in range(1, len(window))]
        avg_gain = sum(gains) / (period - 1) if gains else 0
        avg_loss = sum(losses) / (period - 1) if losses else 0
        if avg_loss == 0:
            result.append(100.0)
        else:
            rs = avg_gain / avg_loss
            result.append(round(100 - 100 / (1 + rs), 2))
    return result


def _compute_mdd(equity: list[float]) -> float:
    peak = equity[0]
    mdd = 0.0
    for v in equity:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100
        if dd > mdd:
            mdd = dd
    return round(mdd, 2)


def _compute_risk_adjusted(equity: list[float], mdd_pct: float) -> tuple[float, float, float]:
    """일별 equity로부터 Sharpe·Sortino·Calmar 계산. 무위험수익률 0 가정."""
    if len(equity) < 2:
        return 0.0, 0.0, 0.0
    # 일별 수익률 시리즈
    rets = [equity[i] / equity[i - 1] - 1 for i in range(1, len(equity)) if equity[i - 1] > 0]
    if not rets:
        return 0.0, 0.0, 0.0
    avg = mean(rets)
    sd = pstdev(rets) if len(rets) > 1 else 0.0
    sharpe = (avg / sd) * _ANNUALIZE_SQRT if sd > 0 else 0.0
    # Sortino: 손실(음수 수익률)만의 표준편차
    downside = [r for r in rets if r < 0]
    dsd = pstdev(downside) if len(downside) > 1 else 0.0
    sortino = (avg / dsd) * _ANNUALIZE_SQRT if dsd > 0 else 0.0
    # Calmar: 연율화 수익률 / MDD. equity는 100 기준이라 누적수익률 = equity[-1]/equity[0] - 1.
    if equity[0] > 0 and mdd_pct > 0:
        total_growth = equity[-1] / equity[0]
        years = len(equity) / _ANNUALIZE_DAYS
        ann_return = total_growth ** (1 / years) - 1 if years > 0 and total_growth > 0 else 0.0
        calmar = ann_return / (mdd_pct / 100)
    else:
        calmar = 0.0
    return round(sharpe, 2), round(sortino, 2), round(calmar, 2)


def _btc_benchmark(times: list[int], count: int):
    """백테스트 times에 정렬된 BTC 매수보유 정규화 시리즈(시작=100) + 총수익률.
    시장 대표 벤치마크 — 전략이 'BTC 그냥 보유'보다 나은지 비교용. BTC 일봉은 공용 캐시 재사용."""
    btc = candle_service.get_candles("KRW-BTC", "days", count)
    by_time = {int(c.timestamp // 1000): c.close for c in btc}
    base = (by_time.get(times[0]) if times else None) or (btc[0].close if btc else 1.0)

    def val_at(t: int) -> float:
        c = by_time.get(t)
        return round(100 * c / base, 2) if c and base else 100.0

    last = by_time.get(times[-1]) if times else None
    ret = round(100 * last / base - 100, 2) if (last and base) else 0.0
    return val_at, ret


def _liquidity_slippage_bps(market: str) -> float:
    """24h 거래대금 기준 유동성 슬리피지 추정(편도 bps). 과거 호가 스프레드는 없으므로 거래대금 프록시로
    근사 — close 체결 가정이 저유동 알트 수익을 과대평가하는 것을 보정한다. 1조≈2bps, 1000억≈6bps,
    100억≈20bps, 10억≈63bps (대략 1/√유동성, 상한 100bps)."""
    t = next((x for x in market_service.get_tickers() if x.market == market), None)
    vol = t.acc_trade_price_24h if t else 0.0
    if vol <= 0:
        return 50.0
    slip = 2.0 * math.sqrt(1e12 / vol)               # 1조원 기준 2bps
    return float(min(100.0, max(2.0, round(slip, 1))))


def _overfit_pvalue(best_sharpe_pp: float, n_obs: int, n_trials: int, n_sim: int = 4000) -> float:
    """다중검정 보정 — 귀무가설(평균수익 0) 하에서 N회 시도의 최대 per-period 샤프가 관측 최고치 이상일
    확률. 귀무 하 샤프 추정치 ≈ N(0, 1/√T) → N개 중 최댓값 분포와 비교. 낮을수록 과최적화가 아님."""
    if n_obs < 5 or n_trials < 1 or best_sharpe_pp <= 0:
        return 1.0
    rng = np.random.default_rng(0)
    maxes = (rng.standard_normal((n_sim, n_trials)) / math.sqrt(n_obs)).max(axis=1)
    return round(float((maxes >= best_sharpe_pp).mean()), 4)


def run_ma_cross(
    market: str,
    fast: int = 5,
    slow: int = 20,
    count: int = 200,
    fee_bps: float = 5.0,
) -> BacktestResult:
    candles = candle_service.get_candles(market, "days", count)
    closes = [c.close for c in candles]
    times  = [c.timestamp // 1000 for c in candles]

    slip_bps = _liquidity_slippage_bps(market)            # 유동성 기반 추정 슬리피지(편도)
    fee = (fee_bps + slip_bps) / 10000.0                  # 거래비용 = 수수료 + 슬리피지
    base = closes[0] if closes and closes[0] > 0 else 1.0

    fast_ma = _sma(closes, fast)
    slow_ma = _sma(closes, slow)

    position = False
    buy_price = 0.0
    equity_val = 100.0
    equity: list[EquityPoint] = []
    trades: list[TradeRecord] = []
    wins = 0

    # 벤치마크 2종: 같은 종목 매수보유(buy&hold) + BTC 매수보유(시장 대표). 전략의 초과수익(알파) 가시화.
    btc_val_at, btc_ret = _btc_benchmark(times, count)

    def _ep(i: int, val: float) -> EquityPoint:
        return EquityPoint(time=times[i], value=round(val, 2),
                           benchmark=round(100 * closes[i] / base, 2),
                           benchmark_btc=btc_val_at(times[i]))

    for i in range(len(closes)):
        # 신호는 "직전 완결봉(i-1)"의 크로스로 판정하고 당일 종가(closes[i])에 체결한다 →
        # 당일 종가로 신호를 알고 그 종가에 사는 룩어헤드를 제거(익일 체결). (i-2→i-1 크로스 → i 체결)
        if i >= 2 and None not in (fast_ma[i - 2], slow_ma[i - 2], fast_ma[i - 1], slow_ma[i - 1]):
            f2, s2, f1, s1 = fast_ma[i - 2], slow_ma[i - 2], fast_ma[i - 1], slow_ma[i - 1]
            # 골든크로스(직전봉 확정) → 당일 매수
            if not position and f2 <= s2 and f1 > s1:
                position = True
                buy_price = closes[i]
                equity_val *= (1 - fee)            # 진입 거래비용
                trades.append(TradeRecord(time=times[i], side="BUY", price=closes[i], pnl=0.0))
            # 데드크로스(직전봉 확정) → 당일 매도
            elif position and f2 >= s2 and f1 < s1:
                pnl = (closes[i] - buy_price) / buy_price * 100
                equity_val *= (1 + pnl / 100) * (1 - fee)   # 실현 후 청산 거래비용
                if pnl > 0:
                    wins += 1
                trades.append(TradeRecord(time=times[i], side="SELL", price=closes[i], pnl=round(pnl, 2)))
                position = False

        # 포지션 보유 중이면 평가 반영
        if position:
            unrealized = (closes[i] - buy_price) / buy_price
            equity.append(_ep(i, equity_val * (1 + unrealized)))
        else:
            equity.append(_ep(i, equity_val))

    sell_count = sum(1 for t in trades if t.side == "SELL")
    win_rate = round(wins / sell_count * 100, 1) if sell_count else 0.0
    equity_values = [e.value for e in equity]
    mdd = _compute_mdd(equity_values)
    sharpe, sortino, calmar = _compute_risk_adjusted(equity_values, mdd)
    bench_return = round(closes[-1] / base * 100 - 100, 2) if closes else 0.0

    return BacktestResult(
        equity=equity,
        trades=trades,
        metrics=BacktestMetrics(
            total_return=round(equity_val - 100, 2),
            benchmark_return=bench_return,
            benchmark_btc_return=btc_ret,
            mdd=mdd,
            win_rate=win_rate,
            trade_count=len(trades),
            sharpe=sharpe,
            sortino=sortino,
            calmar=calmar,
            fee_bps=fee_bps,
            slippage_bps=slip_bps,
        ),
    )


def run_rsi_strategy(
    market: str,
    period: int = 14,
    oversold: float = 30.0,
    overbought: float = 70.0,
    count: int = 200,
    fee_bps: float = 5.0,
) -> BacktestResult:
    candles = candle_service.get_candles(market, "days", count)
    closes = [c.close for c in candles]
    times  = [c.timestamp // 1000 for c in candles]

    slip_bps = _liquidity_slippage_bps(market)            # 유동성 기반 추정 슬리피지(편도)
    fee = (fee_bps + slip_bps) / 10000.0                  # 거래비용 = 수수료 + 슬리피지
    base = closes[0] if closes and closes[0] > 0 else 1.0

    rsi_vals = _rsi(closes, period)

    position = False
    buy_price = 0.0
    equity_val = 100.0
    equity: list[EquityPoint] = []
    trades: list[TradeRecord] = []
    wins = 0

    btc_val_at, btc_ret = _btc_benchmark(times, count)

    def _ep(i: int, val: float) -> EquityPoint:
        return EquityPoint(time=times[i], value=round(val, 2),
                           benchmark=round(100 * closes[i] / base, 2),
                           benchmark_btc=btc_val_at(times[i]))

    for i in range(len(closes)):
        r = rsi_vals[i]
        if r is None:
            equity.append(_ep(i, equity_val))
            continue

        # RSI 과매도 → 매수
        if not position and r < oversold:
            position = True
            buy_price = closes[i]
            equity_val *= (1 - fee)            # 진입 거래비용
            trades.append(TradeRecord(time=times[i], side="BUY", price=closes[i], pnl=0.0))

        # RSI 과매수 → 매도
        elif position and r > overbought:
            pnl = (closes[i] - buy_price) / buy_price * 100
            equity_val *= (1 + pnl / 100) * (1 - fee)   # 실현 후 청산 거래비용
            if pnl > 0:
                wins += 1
            trades.append(TradeRecord(time=times[i], side="SELL", price=closes[i], pnl=round(pnl, 2)))
            position = False

        if position:
            unrealized = (closes[i] - buy_price) / buy_price
            equity.append(_ep(i, equity_val * (1 + unrealized)))
        else:
            equity.append(_ep(i, equity_val))

    sell_count = sum(1 for t in trades if t.side == "SELL")
    win_rate = round(wins / sell_count * 100, 1) if sell_count else 0.0
    equity_values = [e.value for e in equity]
    mdd = _compute_mdd(equity_values)
    sharpe, sortino, calmar = _compute_risk_adjusted(equity_values, mdd)
    bench_return = round(closes[-1] / base * 100 - 100, 2) if closes else 0.0

    return BacktestResult(
        equity=equity,
        trades=trades,
        metrics=BacktestMetrics(
            total_return=round(equity_val - 100, 2),
            benchmark_return=bench_return,
            benchmark_btc_return=btc_ret,
            mdd=mdd,
            win_rate=win_rate,
            trade_count=len(trades),
            sharpe=sharpe,
            sortino=sortino,
            calmar=calmar,
            fee_bps=fee_bps,
            slippage_bps=slip_bps,
        ),
    )


# ── 포트폴리오 백테스트 (여러 종목 가중 보유) ──────────────────
def _empty_portfolio(rebalance_days: int) -> PortfolioBacktestResult:
    return PortfolioBacktestResult(
        equity=[], total_return=0.0, benchmark_return=0.0, mdd=0.0, sharpe=0.0,
        volatility=0.0, contributions=[], rebalance_days=rebalance_days, n_obs=0,
    )


def run_portfolio(markets: list[str], weights: list[float] | None = None,
                  count: int = 180, rebalance_days: int = 0,
                  fee_bps: float = 5.0) -> PortfolioBacktestResult:
    """여러 종목을 목표 비중으로 보유했을 때의 자산 곡선. rebalance_days=0이면 매수보유(비중 드리프트),
    >0이면 그 주기로 목표 비중 리밸런스. 동일가중 매수보유를 벤치마크로 함께 반환.
    거래비용(fee_bps, 편도)은 t0 진입 + 리밸런스 회전(거래대금)에 부과."""
    series: dict[str, tuple[list[float], list[int]]] = {}
    for m in markets:
        candles = candle_service.get_candles(m, "days", count=count)
        closes = [c.close for c in candles]
        if len(closes) >= 5 and all(c > 0 for c in closes):
            series[m] = (closes, [int(c.timestamp / 1000) for c in candles])
    kept = [m for m in markets if m in series]
    if not kept:
        return _empty_portfolio(rebalance_days)

    t_len = min(len(series[m][0]) for m in kept)
    closes = np.array([series[m][0][-t_len:] for m in kept], dtype=float).T  # (T, n)
    times = series[kept[0]][1][-t_len:]
    n = len(kept)

    if weights and len(weights) == n and sum(weights) > 0:
        w = np.array(weights, dtype=float)
        w = w / w.sum()
    else:
        w = np.ones(n) / n

    fee = fee_bps / 10000.0

    def _sim(weight_vec: np.ndarray) -> np.ndarray:
        cash = 1.0 * (1 - fee)               # t0 진입 거래비용
        units = weight_vec * cash / closes[0]
        vals = np.empty(t_len)
        for t in range(t_len):
            v = float((units * closes[t]).sum())
            vals[t] = v
            if rebalance_days > 0 and t > 0 and t % rebalance_days == 0:
                new_units = weight_vec * v / closes[t]            # 목표 비중 복원
                turnover = float((np.abs(new_units - units) * closes[t]).sum())  # 거래대금
                v_after = v - turnover * fee                      # 회전 거래비용
                units = weight_vec * v_after / closes[t]
        return vals

    port = _sim(w) * 100
    bench = _sim(np.ones(n) / n) * 100

    rets = port[1:] / port[:-1] - 1
    vol = float(rets.std(ddof=1) * math.sqrt(_ANNUALIZE_DAYS) * 100) if rets.size > 1 else 0.0
    sharpe = float(rets.mean() / rets.std() * math.sqrt(_ANNUALIZE_DAYS)) if rets.size > 1 and rets.std() > 0 else 0.0
    mdd = _compute_mdd([float(v) for v in port])

    nmap = {t.market: t.korean_name for t in market_service.get_tickers()}
    contributions = [
        AssetContribution(
            market=kept[i], korean_name=nmap.get(kept[i], kept[i]),
            weight=round(float(w[i]), 4),
            asset_return=round(float(closes[-1, i] / closes[0, i] - 1) * 100, 2),
        )
        for i in range(n)
    ]
    equity = [
        PortfolioBacktestPoint(time=times[t], value=round(float(port[t]), 2), benchmark=round(float(bench[t]), 2))
        for t in range(t_len)
    ]
    return PortfolioBacktestResult(
        equity=equity,
        total_return=round(float(port[-1] - 100), 2),
        benchmark_return=round(float(bench[-1] - 100), 2),
        mdd=mdd, sharpe=round(sharpe, 2), volatility=round(vol, 2),
        contributions=contributions, rebalance_days=rebalance_days, n_obs=int(t_len),
    )


# ── 다중 전략 겹쳐 비교 ────────────────────────────────────────
def run_compare(market: str, count: int = 200, fee_bps: float = 5.0) -> StrategyCompareResult:
    """한 종목에 MA 크로스·RSI 역추세를 동시에 돌려 자산 곡선을 함께 반환(전략 간 직접 비교)."""
    ma = run_ma_cross(market, count=count, fee_bps=fee_bps)
    rsi = run_rsi_strategy(market, count=count, fee_bps=fee_bps)
    return StrategyCompareResult(
        times=[e.time for e in ma.equity],
        strategies=[
            StrategyCurve(name="MA 크로스", equity=[e.value for e in ma.equity], total_return=ma.metrics.total_return),
            StrategyCurve(name="RSI 역추세", equity=[e.value for e in rsi.equity], total_return=rsi.metrics.total_return),
        ],
        benchmark=[e.benchmark for e in ma.equity],
        benchmark_btc=[e.benchmark_btc for e in ma.equity],
    )


# ── 워크포워드 (in-sample 그리드서치 → out-of-sample 검증) ─────
# MA 파라미터를 과거(in-sample)에서 고른 뒤 그 다음 구간(out-of-sample)에서만 성과를 집계한다.
# 인샘플 과최적화를 걸러, "미래에도 통하는지"를 보는 표준 검증법.
_WF_GRID = [(5, 20), (10, 30), (10, 60), (20, 60), (5, 40)]


def _ma_curve(closes: list[float], fast: int, slow: int, fee: float, start: int = 0):
    """closes 전체로 MA를 계산하되 start 이후 구간만 매매·평가. (구간수익%, equity 시리즈[start..]) 반환.
    start 이전은 MA 워밍업용으로만 쓴다(룩어헤드 없이 out-of-sample 평가)."""
    fast_ma = _sma(closes, fast)
    slow_ma = _sma(closes, slow)
    pos = False
    buy = 0.0
    eq = 100.0
    curve: list[float] = []
    for i in range(start, len(closes)):
        # 익일 체결: 직전 완결봉(i-2→i-1) 크로스로 판정하고 당일 종가(closes[i])에 체결(룩어헤드 제거).
        if i >= 2 and None not in (fast_ma[i - 2], slow_ma[i - 2], fast_ma[i - 1], slow_ma[i - 1]):
            f2, s2, f1, s1 = fast_ma[i - 2], slow_ma[i - 2], fast_ma[i - 1], slow_ma[i - 1]
            if not pos and f2 <= s2 and f1 > s1:
                pos = True
                buy = closes[i]
                eq *= (1 - fee)
            elif pos and f2 >= s2 and f1 < s1:
                eq *= (1 + (closes[i] - buy) / buy) * (1 - fee)
                pos = False
        curve.append(eq * (1 + (closes[i] - buy) / buy) if pos else eq)
    ret = round((curve[-1] - 100), 2) if curve else 0.0
    return ret, curve


def run_walk_forward(market: str, count: int = 300, n_splits: int = 4, fee_bps: float = 5.0) -> WalkForwardResult:
    candles = candle_service.get_candles(market, "days", count)
    closes = [c.close for c in candles]
    times = [int(c.timestamp // 1000) for c in candles]
    fee = fee_bps / 10000.0
    T = len(closes)
    fold = T // (n_splits + 1)
    if fold < 10:
        return WalkForwardResult(folds=[], equity=[], total_return=0.0, n_splits=0)

    folds: list[WalkForwardFold] = []
    equity: list[EquityPoint] = []
    eq_acc = 100.0
    for k in range(1, n_splits + 1):
        tr_end = fold * k
        te_end = min(fold * (k + 1), T)
        if te_end <= tr_end:
            break
        # in-sample: 0..tr_end 그리드서치로 best (fast, slow)
        best = None
        for f, s in _WF_GRID:
            if s >= tr_end:
                continue
            r, _ = _ma_curve(closes[:tr_end], f, s, fee)
            if best is None or r > best[0]:
                best = (r, f, s)
        if best is None:
            continue
        _, bf, bs = best
        # out-of-sample: best 파라미터로 tr_end..te_end 구간만 평가(MA는 전체로 계산)
        oos_ret, oos_curve = _ma_curve(closes[:te_end], bf, bs, fee, start=tr_end)
        for j, v in enumerate(oos_curve):
            equity.append(EquityPoint(time=times[tr_end + j], value=round(eq_acc * v / 100, 2)))
        if oos_curve:
            eq_acc = eq_acc * oos_curve[-1] / 100
        folds.append(WalkForwardFold(
            fast=bf, slow=bs, oos_return=oos_ret,
            train_end=times[tr_end - 1], test_end=times[te_end - 1],
        ))

    total = round(equity[-1].value - 100, 2) if equity else 0.0
    # 다중검정 보정 — 전체 인샘플에서 그리드 각 파라미터의 per-period 샤프 중 최고치가 우연일 확률
    best_pp = 0.0
    for f, s in _WF_GRID:
        if s >= T:
            continue
        _, curve = _ma_curve(closes, f, s, fee)
        c = np.array(curve)
        pr = c[1:] / c[:-1] - 1.0
        if pr.size > 1 and pr.std() > 0:
            best_pp = max(best_pp, float(pr.mean() / pr.std()))
    pval = _overfit_pvalue(best_pp, len(closes) - 1, len(_WF_GRID))
    return WalkForwardResult(folds=folds, equity=equity, total_return=total, n_splits=len(folds),
                             overfit_pvalue=pval, n_trials=len(_WF_GRID))


# ── 몬테카를로 시뮬레이션 (부트스트랩 가격 경로) ───────────────
# 과거 일간수익률 분포에서 복원추출(부트스트랩)로 향후 horizon일 경로를 n_paths개 생성.
# 정규근사 대신 부트스트랩이라 실제 분포의 팻테일(급등락 빈도)이 보존된다. 각 시점의 백분위
# 밴드(부채꼴)와 최종 수익률 분포·손실확률을 반환한다. (과거 수익률이 미래에도 유효하다는 가정)
def run_montecarlo(market: str, horizon: int = 30, n_paths: int = 1000,
                   count: int = 180) -> MonteCarloResult:
    candles = candle_service.get_candles(market, "days", count)
    closes = np.array([c.close for c in candles], dtype=float)
    nmap = {t.market: t.korean_name for t in market_service.get_tickers()}
    name = nmap.get(market, market)

    empty = MonteCarloResult(
        market=market, korean_name=name, bands=[], horizon=horizon, n_paths=n_paths,
        final_p5=0.0, final_p50=0.0, final_p95=0.0, expected_return=0.0, prob_loss=0.0,
        daily_mean=0.0, daily_vol=0.0, n_obs=0,
    )
    if closes.size < 30 or np.any(closes <= 0):
        return empty

    rets = closes[1:] / closes[:-1] - 1.0
    # 결정적 시드(hashlib) — 내장 hash()는 프로세스마다 난수화돼 재시작 시 부채꼴이 달라진다.
    rng = np.random.default_rng(int.from_bytes(hashlib.md5(market.encode()).digest()[:4], "big"))
    # 부트스트랩: 과거 일간수익률에서 (n_paths, horizon) 복원추출 → 누적곱으로 가격 경로(100 시작).
    sampled = rng.choice(rets, size=(n_paths, horizon), replace=True)
    paths = np.cumprod(1.0 + sampled, axis=1) * 100.0          # (n_paths, horizon)
    paths = np.hstack([np.full((n_paths, 1), 100.0), paths])   # day 0 = 100 추가 → (n_paths, horizon+1)

    qs = np.percentile(paths, [5, 25, 50, 75, 95], axis=0)     # (5, horizon+1)
    bands = [
        MonteCarloPoint(day=d, p5=round(float(qs[0, d]), 2), p25=round(float(qs[1, d]), 2),
                        p50=round(float(qs[2, d]), 2), p75=round(float(qs[3, d]), 2),
                        p95=round(float(qs[4, d]), 2))
        for d in range(horizon + 1)
    ]
    final = paths[:, -1]
    return MonteCarloResult(
        market=market, korean_name=name, bands=bands, horizon=horizon, n_paths=n_paths,
        final_p5=round(float(np.percentile(final, 5)) - 100, 2),
        final_p50=round(float(np.percentile(final, 50)) - 100, 2),
        final_p95=round(float(np.percentile(final, 95)) - 100, 2),
        expected_return=round(float(final.mean()) - 100, 2),
        prob_loss=round(float((final < 100).mean()) * 100, 2),
        daily_mean=round(float(rets.mean()) * 100, 3),
        daily_vol=round(float(rets.std()) * 100, 3),
        n_obs=int(rets.size),
    )


# ── 시계열 모멘텀(추세추종) + 변동성 타게팅 ────────────────────
# 횡단면 모멘텀(종목끼리 순위, quant_service)과 달리, 각 종목이 '자기 과거' 대비 오르는지로
# 롱/현금을 결정한다(time-series momentum, Moskowitz·Ooi·Pedersen 2012). 비중은 변동성 역가중
# (변동성 큰 종목 작게 — 모멘텀 크래시 완화, Barroso·Santa-Clara 2015). 업비트 현물이라 숏 없이
# 롱/현금만. 거래비용(fee_bps, 편도)을 리밸런스 회전(turnover)에 부과해 과대평가를 막는다.
_TSMOM_TOP = 30
_TSMOM_CANDLES = 200
_TSMOM_LOOKBACK = 60
_TSMOM_HOLDING = 5
_TSMOM_CAP = 0.25         # 종목당 비중 상한(한 종목 독식 방지)
_TSMOM_SKIP = 5           # 12-1 모멘텀: 추세 측정에서 최근 N일 제외(단기 반전 오염 차단)
_TSMOM_TARGET_VOL = 0.60  # 연율 목표 변동성 — 포트폴리오 변동성 타게팅(Moreira·Muir 2017)
_TSMOM_BEAR_SCALE = 0.30  # 시장이 자기 추세 아래(약세)면 익스포저 축소(모멘텀 크래시 방지, Daniel·Moskowitz 2016)
_TSMOM_BAND = 0.03        # 무거래 밴드 — 목표 비중이 직전과 이만큼 미만 차이면 유지(턴오버 히스테리시스)
# 스테이블코인 — KRW-USDT는 환율 변동으로 변동성 필터를 통과하지만 추세추종 대상이 아니므로 제외.
_STABLECOINS = {"KRW-USDT", "KRW-USDC", "KRW-DAI", "KRW-BUSD", "KRW-TUSD"}


def run_tsmom(top: int = _TSMOM_TOP, lookback: int = _TSMOM_LOOKBACK,
              holding: int = _TSMOM_HOLDING, count: int = _TSMOM_CANDLES,
              fee_bps: float = 5.0, skip: int = _TSMOM_SKIP) -> TsmomResult:
    """시계열 모멘텀 + 변동성 역가중 + 국면/크래시 필터 + 변동성 타게팅 + 턴오버 히스테리시스.
    개선점: ①12-1 skip(추세 측정에서 최근 skip일 제외 — 단기 반전 오염 차단) ②시장이 약세(자기 추세
    아래)거나 고변동이면 총 익스포저를 동적 축소(모멘텀 크래시 방지·변동성 타게팅) ③무거래 밴드로
    불필요 회전 절감. (학술: Moskowitz·Ooi·Pedersen 2012, Barroso·Santa-Clara 2015, Daniel·Moskowitz 2016, Moreira·Muir 2017)"""
    from app.services import quant_service  # 지연 import(순환 방지) — 공용 일봉 캐시 재사용
    tickers = [t for t in market_service.get_tickers() if t.market not in _STABLECOINS][:top]
    markets = [t.market for t in tickers]
    # 공통 윈도우 — 신규 상장(짧은 히스토리)이 윈도우를 잘라 리밸런스 수가 줄지 않게 최소 120일 보장.
    kept, closes = quant_service.closes_matrix(markets, count=count, min_len=max(lookback + holding + 20, 120))
    empty = TsmomResult(equity=[], total_return=0.0, benchmark_return=0.0, sharpe=0.0, mdd=0.0,
                        avg_exposure=0.0, holdings=[], lookback=lookback, holding=holding, n=0, fee_bps=fee_bps)
    if len(kept) < 5:
        return empty
    T, n = closes.shape
    skip = max(0, min(skip, lookback - 5))   # skip은 lookback 안쪽으로 제한
    if T <= lookback + holding:
        return empty

    rets = closes[1:] / closes[:-1] - 1.0                  # (T-1, n) 일간수익률
    mkt_ret = rets.mean(axis=1)                            # 동일가중 시장 일간수익률 (T-1,)
    nmap = {t.market: t.korean_name for t in tickers}
    base_candles = candle_service.get_candles(kept[0], "days", count)
    times = [int(c.timestamp // 1000) for c in base_candles][-T:]
    fee = fee_bps / 10000.0
    ann = math.sqrt(_ANNUALIZE_DAYS)

    def _base_weights(t_idx: int):
        """종목별 시계열 모멘텀 신호 × 변동성 역가중 비중(합=1). 추세는 12-1(최근 skip일 제외)로 측정."""
        trailing = closes[t_idx - skip] / closes[t_idx - lookback] - 1.0  # 최근 skip일 반전 제외
        signal = (trailing > 0).astype(float)                            # 롱(추세 +) / 현금
        vol = rets[t_idx - lookback:t_idx].std(axis=0)                   # 최근 변동성
        tradeable = vol > 0.005                                          # 스테이블/극저변동 제외
        inv_vol = np.where(tradeable, 1.0 / vol, 0.0)                    # 변동성 역가중
        raw = signal * inv_vol
        s = raw.sum()
        w = raw / s if s > 0 else np.zeros(n)
        for _ in range(5):                                              # 비중 상한 클립→재정규화 수렴
            if w.sum() <= 0 or w.max() <= _TSMOM_CAP + 1e-9:
                break
            w = np.minimum(w, _TSMOM_CAP)
            w = w / w.sum()
        return w, signal

    def _exposure(t_idx: int) -> float:
        """총 익스포저 배수 ∈ [0,1] — 시장 약세면 축소(크래시 필터), 고변동이면 축소(변동성 타게팅)."""
        trend_f = 1.0 if closes[t_idx].mean() > closes[t_idx - lookback].mean() else _TSMOM_BEAR_SCALE
        mvol = mkt_ret[t_idx - lookback:t_idx].std() * ann               # 시장 연율 변동성
        vol_f = min(1.0, _TSMOM_TARGET_VOL / mvol) if mvol > 0 else 1.0
        return float(max(0.0, min(1.0, trend_f * vol_f)))

    eq, bench, eq_t, exposures = [100.0], [100.0], [times[lookback]], []
    prev_w = np.zeros(n)
    t = lookback
    while t + holding < T:
        target = _base_weights(t)[0] * _exposure(t)                      # 투자비중=exp, 나머지 현금
        # 무거래 밴드: 직전과 차이가 작은 종목은 그대로 유지(불필요 회전 절감)
        w_eff = np.where(np.abs(target - prev_w) < _TSMOM_BAND, prev_w, target)
        turnover = float(np.abs(w_eff - prev_w).sum())
        fwd = closes[t + holding] / closes[t] - 1.0
        port_r = float((w_eff * fwd).sum()) - turnover * fee
        eq.append(eq[-1] * (1 + port_r))
        bench.append(bench[-1] * (1 + float(fwd.mean())))               # 동일가중 매수보유
        eq_t.append(times[t + holding])
        exposures.append(float(w_eff.sum()))                            # 실제 투자비중(현금 제외)
        prev_w = w_eff
        t += holding

    eq_arr = np.array(eq)
    rebal_r = eq_arr[1:] / eq_arr[:-1] - 1.0
    ppy = _ANNUALIZE_DAYS / holding
    sharpe = float(rebal_r.mean() / rebal_r.std() * math.sqrt(ppy)) if rebal_r.size > 1 and rebal_r.std() > 0 else 0.0

    # 현재(최신) 보유 — 마지막 시점 목표(익스포저 반영).
    trailing_now = closes[-1 - skip] / closes[-1 - lookback] - 1.0
    w_now = _base_weights(T - 1)[0] * _exposure(T - 1)
    holdings = [
        TsmomHolding(market=kept[i], korean_name=nmap.get(kept[i], kept[i]),
                     momentum=round(float(trailing_now[i]) * 100, 2), weight=round(float(w_now[i]) * 100, 2))
        for i in np.argsort(-w_now) if w_now[i] > 0.001
    ][:15]

    equity = [
        TsmomEquityPoint(time=tt, value=round(e, 2), benchmark=round(b, 2))
        for tt, e, b in zip(eq_t, eq, bench)
    ]
    return TsmomResult(
        equity=equity,
        total_return=round(eq[-1] - 100, 2),
        benchmark_return=round(bench[-1] - 100, 2),
        sharpe=round(sharpe, 2),
        mdd=_compute_mdd(eq),
        avg_exposure=round(float(np.mean(exposures)) * 100, 1) if exposures else 0.0,
        holdings=holdings, lookback=lookback, holding=holding, n=n, fee_bps=fee_bps,
    )
