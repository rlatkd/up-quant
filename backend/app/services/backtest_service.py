import math
from statistics import mean, pstdev

import numpy as np

from app.schemas.backtest import (
    AssetContribution,
    BacktestMetrics,
    BacktestResult,
    EquityPoint,
    PortfolioBacktestPoint,
    PortfolioBacktestResult,
    StrategyCompareResult,
    StrategyCurve,
    TradeRecord,
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

    fee = fee_bps / 10000.0
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
        if fast_ma[i] is None or slow_ma[i] is None:
            equity.append(_ep(i, equity_val))
            continue

        prev_fast = fast_ma[i - 1]
        prev_slow = slow_ma[i - 1]

        # 골든크로스 → 매수
        if not position and prev_fast is not None and prev_slow is not None:
            if prev_fast <= prev_slow and fast_ma[i] > slow_ma[i]:
                position = True
                buy_price = closes[i]
                equity_val *= (1 - fee)            # 진입 거래비용
                trades.append(TradeRecord(time=times[i], side="BUY", price=closes[i], pnl=0.0))

        # 데드크로스 → 매도
        elif position and prev_fast is not None and prev_slow is not None:
            if prev_fast >= prev_slow and fast_ma[i] < slow_ma[i]:
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

    fee = fee_bps / 10000.0
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
        pf, ps = fast_ma[i - 1], slow_ma[i - 1]
        if fast_ma[i] is None or slow_ma[i] is None or pf is None or ps is None:
            curve.append(eq)
            continue
        if not pos and pf <= ps and fast_ma[i] > slow_ma[i]:
            pos = True
            buy = closes[i]
            eq *= (1 - fee)
        elif pos and pf >= ps and fast_ma[i] < slow_ma[i]:
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
    return WalkForwardResult(folds=folds, equity=equity, total_return=total, n_splits=len(folds))
