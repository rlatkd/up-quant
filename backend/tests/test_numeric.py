"""수치 코어 회귀 테스트 — 백테스트·분석의 순수함수를 합성 입력으로 검증한다.
(네트워크 의존 함수는 제외. TSMOM 스테이블코인 버그처럼 수식 오류를 싸게 잡는 게 목적.)"""
from app.services import backtest_service as bt
from app.services import analysis_service as an


# ── 최대 낙폭(MDD) ───────────────────────────────────────────
def test_mdd_peak_to_trough():
    # 120 고점 → 60 저점 = 50% 낙폭
    assert bt._compute_mdd([100, 120, 60, 90]) == 50.0


def test_mdd_monotonic_up():
    assert bt._compute_mdd([100, 110, 120]) == 0.0


# ── 리스크 조정 지표 ─────────────────────────────────────────
def test_risk_adjusted_zero_vol():
    sharpe, sortino, calmar = bt._compute_risk_adjusted([100, 100, 100], 0.0)
    assert sharpe == 0.0 and sortino == 0.0 and calmar == 0.0


# ── 다중검정 과최적화 p값 ────────────────────────────────────
def test_overfit_pvalue_zero_sharpe_is_certain_luck():
    assert bt._overfit_pvalue(0.0, 100, 5) == 1.0


def test_overfit_pvalue_high_sharpe_is_unlikely_luck():
    p = bt._overfit_pvalue(5.0, 100, 5)
    assert 0.0 <= p < 0.2


def test_overfit_pvalue_more_trials_raises_p():
    p1 = bt._overfit_pvalue(0.3, 100, 1)
    p20 = bt._overfit_pvalue(0.3, 100, 20)
    assert p20 >= p1   # 시도가 많을수록 우연으로 그 샤프가 나올 확률↑


# ── 피어슨 상관 ──────────────────────────────────────────────
def test_pearson_perfect_positive():
    assert an._pearson([1, 2, 3, 4], [2, 4, 6, 8]) == 1.0


def test_pearson_perfect_negative():
    assert an._pearson([1, 2, 3, 4], [4, 3, 2, 1]) == -1.0


# ── 일간 수익률 ──────────────────────────────────────────────
def test_daily_returns():
    r = an._daily_returns([100, 110, 99])
    assert abs(r[0] - 0.10) < 1e-9
    assert abs(r[1] - (-0.10)) < 1e-9
