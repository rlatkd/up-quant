"""이번 개선분 회귀 테스트 — 네트워크 없이 순수 로직/캐시 라우팅만 검증.
- 페어 백테스트의 형성기간 out-of-sample 불변식(형성기간엔 매매·평가 없음)
- 월봉 canonical 캐시 공유(여러 count 요청이 종목당 1회만 fetch)
"""
import numpy as np

from app.core import cache
from app.schemas.candle import CandleItem
from app.services import candle_service, quant_service


def test_pair_backtest_no_trades_in_formation():
    # 형성기간(trade_start 이전)은 β 추정용이라 매매·평가가 없어야 한다 → 자산곡선이 그대로 100.
    spread = np.concatenate([np.linspace(-3.0, 3.0, 30), np.sin(np.linspace(0, 10, 30))])
    z, eq, ret, trades, win = quant_service._pair_backtest(spread, trade_start=30)
    assert all(abs(v - 100.0) < 1e-9 for v in eq[:30])   # 형성기간 자산 불변(거래 없음)
    assert z.shape[0] == spread.size                      # z는 전 구간 계산(신호 판정용)


def test_pair_backtest_trade_start_zero_trades_whole_window():
    # trade_start=0이면 전 구간 매매(과거 동작과 동일) — 회귀 안전망.
    spread = np.concatenate([np.full(20, 0.0), np.full(5, 5.0), np.full(20, 0.0)])
    _, _, _, trades, _ = quant_service._pair_backtest(spread, trade_start=0)
    assert trades >= 1


def test_months_candles_use_shared_canonical_fetch(monkeypatch):
    cache.clear()
    calls = {"n": 0}

    def stub(market, interval, count):
        calls["n"] += 1
        return [CandleItem(timestamp=i * 1000, open=1.0, high=1.0, low=1.0,
                           close=float(i + 1), volume=0.0) for i in range(count)]

    monkeypatch.setattr(candle_service, "_fetch", stub)
    a = candle_service.get_candles("KRW-BTC", "months", 30)
    b = candle_service.get_candles("KRW-BTC", "months", 61)
    assert calls["n"] == 1                                # canonical 1회만 fetch(슬라이스 공유)
    assert len(a) == 30 and len(b) == 61
    assert [c.close for c in a] == [c.close for c in b][-30:]   # a는 canonical의 뒤 30개


def test_weeks_candles_use_shared_canonical_fetch(monkeypatch):
    cache.clear()
    calls = {"n": 0}

    def stub(market, interval, count):
        calls["n"] += 1
        return [CandleItem(timestamp=i * 1000, open=1.0, high=1.0, low=1.0,
                           close=float(i + 1), volume=0.0) for i in range(count)]

    monkeypatch.setattr(candle_service, "_fetch", stub)
    candle_service.get_candles("KRW-ETH", "weeks", 50)
    candle_service.get_candles("KRW-ETH", "weeks", 100)
    assert calls["n"] == 1                                # 주봉도 canonical 1회 공유
