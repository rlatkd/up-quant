from app.schemas.backtest import BacktestResult, EquityPoint, TradeRecord, BacktestMetrics
from app.services import candle_service


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

    return BacktestResult(
        equity=equity,
        trades=trades,
        metrics=BacktestMetrics(
            total_return=round(equity_val - 100, 2),
            mdd=_compute_mdd(equity_values),
            win_rate=win_rate,
            trade_count=len(trades),
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

    return BacktestResult(
        equity=equity,
        trades=trades,
        metrics=BacktestMetrics(
            total_return=round(equity_val - 100, 2),
            mdd=_compute_mdd(equity_values),
            win_rate=win_rate,
            trade_count=len(trades),
        ),
    )
