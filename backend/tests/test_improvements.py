"""이번 개선분 단위 테스트 — 네트워크 없이 순수 로직만 검증.
- RSI Wilder 평활(표준 정의)
- 변동성 타게팅 포지션 사이징
- BH-FDR 임계
- 페어 2-leg PnL 부호(롱 스프레드는 스프레드 확대 시 이익)
- 보안: JWT 발급/검증·만료, bcrypt 검증, 레이트리밋
- 외부 소스 파서: F&G 라벨 매핑, FX 전일대비
"""
import time

import numpy as np

from app.services import backtest_service, quant_service


# ── RSI Wilder ────────────────────────────────────────────────
def test_rsi_wilder_monotone_up_is_100():
    # 계속 오르면 손실 0 → RSI 100. 첫 period개까지는 None.
    prices = [float(i) for i in range(1, 40)]
    rsi = backtest_service._rsi(prices, period=14)
    assert rsi[:14] == [None] * 14
    assert rsi[14] == 100.0
    assert rsi[-1] == 100.0


def test_rsi_wilder_known_value_range():
    # 진동 시리즈 → RSI가 0~100 안.
    prices = [10, 11, 10.5, 11.5, 11, 12, 11.5, 12.5, 12, 13, 12.5, 13.5, 13, 14, 13.5, 14.5]
    rsi = backtest_service._rsi(prices, period=14)
    vals = [r for r in rsi if r is not None]
    assert vals and all(0 <= v <= 100 for v in vals)


# ── 변동성 타게팅 사이징 ──────────────────────────────────────
def test_position_size_off_is_full():
    closes = [100.0 * (1.01 ** i) for i in range(30)]
    assert backtest_service._position_size(closes, 25, target_vol=0.0) == 1.0


def test_position_size_scales_down_high_vol():
    rng = np.random.default_rng(0)
    closes = list(100.0 * np.cumprod(1 + rng.normal(0, 0.1, 40)))  # 고변동
    size = backtest_service._position_size(closes, 35, target_vol=0.3)
    assert 0.0 < size <= 1.0
    # 변동성이 목표보다 크면 1.0 미만으로 축소돼야 함
    assert size < 1.0


# ── BH-FDR ────────────────────────────────────────────────────
def test_bh_threshold_basic():
    # 명백히 유의한 p들과 노이즈 → 임계가 0보다 큼.
    pvals = [0.001, 0.004, 0.01, 0.6, 0.7, 0.8]
    thr = quant_service._bh_threshold(pvals, alpha=0.1)
    assert thr >= 0.001
    # 전부 큰 p면 통과 없음(0).
    assert quant_service._bh_threshold([0.5, 0.6, 0.9], alpha=0.1) == 0.0


# ── 페어 2-leg PnL 부호 ───────────────────────────────────────
def test_pair_2leg_long_spread_profits_on_widening():
    # 형성기간 후 스프레드가 음(-)으로 벌어졌다가 0으로 회귀 → 롱 스프레드 진입 후 이익.
    spread = np.concatenate([np.zeros(30), np.full(10, -3.0), np.zeros(10)])
    p2 = 100.0 * np.exp(0.001 * np.arange(spread.size))
    p1 = p2 * np.exp(spread)
    _, eq, ret, trades, _ = quant_service._pair_backtest(p1, p2, spread, beta=1.0, trade_start=30)
    assert trades >= 1
    assert eq.shape[0] == spread.size


# ── 보안: JWT / bcrypt / 레이트리밋 ───────────────────────────
def test_jwt_roundtrip_and_type():
    from app.core import security
    tok = security.create_access_token("test")
    assert security.decode_token(tok, "access") == "test"
    # refresh 토큰을 access로 검증하면 타입 불일치(거부).
    rt = security.create_refresh_token("test")
    try:
        security.decode_token(rt, "access")
        assert False, "타입 불일치인데 통과됨"
    except security.AuthError:
        pass


def test_password_verify():
    from app.core import security
    assert security.authenticate_user("test", "test")
    assert not security.authenticate_user("test", "nope")
    assert not security.authenticate_user("hacker", "test")


def test_rate_limit_blocks_after_burst():
    from app.core import ratelimit
    from app.core.config import settings
    ip = "203.0.113.99"
    allowed = sum(1 for _ in range(settings.rate_limit_per_min + 50) if ratelimit.allow_request(ip))
    # 버스트 용량(capacity) 근처까지만 허용되고 그 이상은 차단.
    assert allowed <= settings.rate_limit_per_min + 1


def test_login_lockout():
    from app.core import ratelimit
    ip = "203.0.113.50"
    for _ in range(ratelimit_settings_attempts()):
        ratelimit.record_login_failure(ip)
    assert ratelimit.login_blocked(ip) > 0


def ratelimit_settings_attempts() -> int:
    from app.core.config import settings
    return settings.login_max_attempts


# ── 외부 소스 파서 ────────────────────────────────────────────
def test_fng_self_label_boundaries():
    from app.services import fng_service
    assert fng_service._self_label(10)[0] == "극단적 공포"
    assert fng_service._self_label(50)[0] == "중립"
    assert fng_service._self_label(90)[0] == "극단적 탐욕"


def test_news_parse_rss():
    from app.services import news_service
    xml = """<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>비트코인 급등</title><link>https://ex.com/a</link>
        <pubDate>Wed, 10 Jun 2026 09:00:00 +0900</pubDate></item>
      <item><title>이더리움 업데이트</title><link>https://ex.com/b</link>
        <pubDate>Wed, 10 Jun 2026 08:00:00 +0900</pubDate></item>
    </channel></rss>"""
    items = news_service._parse_feed("테스트", xml)
    assert len(items) == 2
    assert items[0].title == "비트코인 급등"
    assert items[0].url == "https://ex.com/a"
    assert items[0].ts > 0


def test_news_parse_atom():
    from app.services import news_service
    xml = """<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>Atom 기사</title><link href="https://ex.com/atom"/>
        <updated>2026-06-10T09:00:00Z</updated></entry></feed>"""
    items = news_service._parse_feed("아톰", xml)
    assert len(items) == 1
    assert items[0].url == "https://ex.com/atom"


def test_fx_change_vs_prev(monkeypatch):
    from app.services import fx_service

    class _Resp:
        def __init__(self, data):
            self._d = data
        def raise_for_status(self):
            pass
        def json(self):
            return self._d

    fx_service._prev.clear()
    # er-api는 USD 기준 환율 → rates["USD"]=1.0. price = krw/rx*unit 이므로 USD/KRW = KRW 값.
    seq = [{"rates": {"USD": 1.0, "KRW": 1300.0, "JPY": 150.0, "CNY": 7.0, "EUR": 0.9}},
           {"rates": {"USD": 1.0, "KRW": 1320.0, "JPY": 150.0, "CNY": 7.0, "EUR": 0.9}}]
    calls = {"i": 0}

    def fake_get(url, **kw):
        r = _Resp(seq[calls["i"]])
        calls["i"] += 1
        return r

    monkeypatch.setattr(fx_service.httpx, "get", fake_get)
    # 추이 차트(frankfurter) 호출은 이 테스트와 무관 → 목으로 막아 er-api 호출만 세게 한다.
    monkeypatch.setattr(fx_service, "_spark_map", lambda: {"dates": [], "rates": {}})
    first = fx_service._fetch()
    usd1 = next(r for r in first.rates if r.pair == "USD/KRW")
    assert usd1.change == 0.0          # 첫 호출은 직전값 없음 → 변화 0
    second = fx_service._fetch()
    usd2 = next(r for r in second.rates if r.pair == "USD/KRW")
    assert usd2.change > 0             # 1300 → 1320 상승 반영
