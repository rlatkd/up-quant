import math
from statistics import mean, pstdev

from app.schemas.backtest import BacktestResult, EquityPoint, TradeRecord, BacktestMetrics
from app.services import candle_service

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


def run_ma_cross(
    market: str,
    fast: int = 5,
    slow: int = 20,
    count: int = 200,
) -> BacktestResult:
    candles = candle_service.get_candles(market, "days", count)
    closes = [c.close for c in candles]
    times  = [c.timestamp // 1000 for c in candles]

    fast_ma = _sma(closes, fast)
    slow_ma = _sma(closes, slow)

    position = False
    buy_price = 0.0
    equity_val = 100.0
    equity: list[EquityPoint] = []
    trades: list[TradeRecord] = []
    wins = 0

    for i in range(len(closes)):
        if fast_ma[i] is None or slow_ma[i] is None:
            equity.append(EquityPoint(time=times[i], value=round(equity_val, 2)))
            continue

        prev_fast = fast_ma[i - 1]
        prev_slow = slow_ma[i - 1]

        # 골든크로스 → 매수
        if not position and prev_fast is not None and prev_slow is not None:
            if prev_fast <= prev_slow and fast_ma[i] > slow_ma[i]:
                position = True
                buy_price = closes[i]
                trades.append(TradeRecord(time=times[i], side="BUY", price=closes[i], pnl=0.0))

        # 데드크로스 → 매도
        elif position and prev_fast is not None and prev_slow is not None:
            if prev_fast >= prev_slow and fast_ma[i] < slow_ma[i]:
                pnl = (closes[i] - buy_price) / buy_price * 100
                equity_val *= (1 + pnl / 100)
                if pnl > 0:
                    wins += 1
                trades.append(TradeRecord(time=times[i], side="SELL", price=closes[i], pnl=round(pnl, 2)))
                position = False

        # 포지션 보유 중이면 평가 반영
        if position:
            unrealized = (closes[i] - buy_price) / buy_price
            equity.append(EquityPoint(time=times[i], value=round(equity_val * (1 + unrealized), 2)))
        else:
            equity.append(EquityPoint(time=times[i], value=round(equity_val, 2)))

    sell_count = sum(1 for t in trades if t.side == "SELL")
    win_rate = round(wins / sell_count * 100, 1) if sell_count else 0.0
    equity_values = [e.value for e in equity]
    mdd = _compute_mdd(equity_values)
    sharpe, sortino, calmar = _compute_risk_adjusted(equity_values, mdd)

    return BacktestResult(
        equity=equity,
        trades=trades,
        metrics=BacktestMetrics(
            total_return=round(equity_val - 100, 2),
            mdd=mdd,
            win_rate=win_rate,
            trade_count=len(trades),
            sharpe=sharpe,
            sortino=sortino,
            calmar=calmar,
        ),
    )


def run_rsi_strategy(
    market: str,
    period: int = 14,
    oversold: float = 30.0,
    overbought: float = 70.0,
    count: int = 200,
) -> BacktestResult:
    candles = candle_service.get_candles(market, "days", count)
    closes = [c.close for c in candles]
    times  = [c.timestamp // 1000 for c in candles]

    rsi_vals = _rsi(closes, period)

    position = False
    buy_price = 0.0
    equity_val = 100.0
    equity: list[EquityPoint] = []
    trades: list[TradeRecord] = []
    wins = 0

    for i in range(len(closes)):
        r = rsi_vals[i]
        if r is None:
            equity.append(EquityPoint(time=times[i], value=round(equity_val, 2)))
            continue

        # RSI 과매도 → 매수
        if not position and r < oversold:
            position = True
            buy_price = closes[i]
            trades.append(TradeRecord(time=times[i], side="BUY", price=closes[i], pnl=0.0))

        # RSI 과매수 → 매도
        elif position and r > overbought:
            pnl = (closes[i] - buy_price) / buy_price * 100
            equity_val *= (1 + pnl / 100)
            if pnl > 0:
                wins += 1
            trades.append(TradeRecord(time=times[i], side="SELL", price=closes[i], pnl=round(pnl, 2)))
            position = False

        if position:
            unrealized = (closes[i] - buy_price) / buy_price
            equity.append(EquityPoint(time=times[i], value=round(equity_val * (1 + unrealized), 2)))
        else:
            equity.append(EquityPoint(time=times[i], value=round(equity_val, 2)))

    sell_count = sum(1 for t in trades if t.side == "SELL")
    win_rate = round(wins / sell_count * 100, 1) if sell_count else 0.0
    equity_values = [e.value for e in equity]
    mdd = _compute_mdd(equity_values)
    sharpe, sortino, calmar = _compute_risk_adjusted(equity_values, mdd)

    return BacktestResult(
        equity=equity,
        trades=trades,
        metrics=BacktestMetrics(
            total_return=round(equity_val - 100, 2),
            mdd=mdd,
            win_rate=win_rate,
            trade_count=len(trades),
            sharpe=sharpe,
            sortino=sortino,
            calmar=calmar,
        ),
    )
