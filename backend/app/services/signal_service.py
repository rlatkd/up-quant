"""실행 가능한 시그널 집계 — 정량 분석 결과를 '지금 할 수 있는 액션'으로 모은다.

원칙: 새 계산을 하지 않고 기존 캐시(모멘텀·페어·국면·tickers)만 합성한다(추가 팬아웃 0).
신뢰성: 인샘플·생존편향·거래비용 한계는 각 분석과 동일하게 적용되며, 시그널은 '후보'이지 보장 아님.
"""
from datetime import datetime, timezone, timedelta

from app.core.cache import cached
from app.core import config
from app.schemas.signal import SignalItem, SignalsResult
from app.services import market_service, quant_service

_KST = timezone(timedelta(hours=9))
_W52_LIMIT = 30          # 52주 신고가 시그널은 거래대금 상위 N종만(잡코인 노이즈 제외)
_SURGE_RATE = 0.05       # 급등 임계(전일대비 +5%)


def _compute_signals() -> SignalsResult:
    items: list[SignalItem] = []

    # ① 시장 국면(HMM) — 현재 국면 + 직전 봉 대비 전환 여부.
    reg = quant_service.get_regime(2)
    regime_label = reg.current_label or "—"
    regime_changed = False
    if len(reg.points) >= 2:
        regime_changed = reg.points[-1].regime != reg.points[-2].regime
    if regime_changed:
        items.append(SignalItem(
            kind="regime", title=f"시장 국면 전환 → {regime_label}",
            detail="HMM 국면이 직전 대비 바뀜 — 익스포저 점검", action="/regime"))

    # ② 횡단면 모멘텀 — 현물 실행 가능한 롱온리 상위분위(진입 후보).
    mom = quant_service.get_momentum(long_only=True)
    for h in mom.long[:5]:
        items.append(SignalItem(
            kind="momentum", market=h.market, korean_name=h.korean_name,
            title=f"{h.korean_name} 모멘텀 롱 후보",
            detail=f"최근 추세 {h.momentum:+.1f}%", value=h.momentum,
            action=f"/coins/{h.market}"))

    # ③ 공적분 페어 — 현재 |z|>2 진입 신호인 페어(FDR 통과 우선).
    pairs = quant_service.get_pairs()
    pair_signals = [p for p in pairs.pairs if p.signal != "NEUTRAL"]
    pair_signals.sort(key=lambda p: (not p.fdr_pass, abs(p.zscore) * -1))
    for p in pair_signals[:5]:
        side = "롱 스프레드" if p.signal == "LONG_SPREAD" else "숏 스프레드"
        tag = " · FDR통과" if p.fdr_pass else ""
        items.append(SignalItem(
            kind="pair", title=f"{p.korean_name1}–{p.korean_name2} 페어 {side}{tag}",
            detail=f"z={p.zscore:+.2f} (|z|>2 진입)", value=p.zscore, action="/factor"))

    # ④ 52주 신고가 경신 / 급등 — 거래대금 상위에서.
    tickers = market_service.get_tickers()
    for t in tickers[:_W52_LIMIT]:
        if t.is_52w_high:
            items.append(SignalItem(
                kind="breakout", market=t.market, korean_name=t.korean_name,
                title=f"{t.korean_name} 52주 신고가 경신", detail="추세 돌파 후보",
                value=round(t.change_rate * 100, 2), action=f"/coins/{t.market}"))
    for t in tickers[:_W52_LIMIT]:
        if t.change_rate >= _SURGE_RATE and not t.is_52w_high:
            items.append(SignalItem(
                kind="breakout", market=t.market, korean_name=t.korean_name,
                title=f"{t.korean_name} 급등 {t.change_rate * 100:+.1f}%",
                detail="단기 급등 — 과열/추세 판단 필요",
                value=round(t.change_rate * 100, 2), action=f"/coins/{t.market}"))

    return SignalsResult(
        as_of=datetime.now(_KST).strftime("%Y-%m-%d %H:%M KST"),
        regime_label=regime_label, regime_changed=regime_changed,
        items=items, n=len(items),
    )


def get_signals() -> SignalsResult:
    # 기존 캐시 합성이라 가볍지만, 동일 결과 반복 호출 대비 짧게 캐시(국면/모멘텀 갱신 주기와 정합).
    return cached("signals", config.TTL_TICKER, _compute_signals)
