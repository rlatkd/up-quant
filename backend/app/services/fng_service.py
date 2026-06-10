"""공포·탐욕 지수 — 실제 Crypto Fear & Greed Index(alternative.me, 무료·무인증)를 백엔드가
프록시 + 캐시. 업비트 코인동향/대시보드의 '공포·탐욕' 위젯을 자체 breadth 휴리스틱이 아닌
업계 표준 지수로 표시한다.
⚠️ 외부 실패 시 숨기지 않고, 자체 '시장 폭(상승비율+평균등락)' 프록시로 폴백하되 source를 명시한다."""
import logging
from datetime import datetime, timezone, timedelta

import httpx

from app.core import metrics
from app.core.cache import cached
from app.schemas.trends import FearGreed
from app.services import market_service

logger = logging.getLogger("upquant")
_KST = timezone(timedelta(hours=9))
_URL = "https://api.alternative.me/fng/?limit=1"

# alternative.me 분류 → 한글
_LABELS = {
    "Extreme Fear": "극단적 공포",
    "Fear": "공포",
    "Neutral": "중립",
    "Greed": "탐욕",
    "Extreme Greed": "극단적 탐욕",
}


def _now() -> str:
    return datetime.now(_KST).strftime("%Y-%m-%d %H:%M KST")


def _self_label(v: int) -> tuple[str, str]:
    """자체 폴백 시 값 → (한글 라벨, 원문 분류)."""
    if v < 25:
        return "극단적 공포", "Extreme Fear"
    if v < 45:
        return "공포", "Fear"
    if v <= 55:
        return "중립", "Neutral"
    if v <= 75:
        return "탐욕", "Greed"
    return "극단적 탐욕", "Extreme Greed"


def _self_fallback() -> FearGreed:
    """외부 실패 시 자체 시장 폭 프록시 — 상승비율 0.6 + 평균등락 스코어 0.4. (정직하게 source 명시)"""
    tickers = market_service.get_tickers()
    if not tickers:
        return FearGreed(value=50, label="중립", classification="Neutral", as_of=_now(),
                         source="자체(시장 폭)", error="F&G 외부 소스 실패 — 자체 프록시로 대체")
    rise = sum(1 for t in tickers if t.change == "RISE")
    avg = sum(t.change_rate for t in tickers) / len(tickers) * 100
    rise_ratio = rise / len(tickers) * 100
    change_score = min(100.0, max(0.0, avg * 5 + 50))
    v = int(round(rise_ratio * 0.6 + change_score * 0.4))
    label, cls = _self_label(v)
    return FearGreed(value=v, label=label, classification=cls, as_of=_now(),
                     source="자체(시장 폭)", error="F&G 외부 소스 실패 — 자체 프록시로 대체")


def _fetch() -> FearGreed:
    r = httpx.get(_URL, timeout=4.0, headers={"Accept": "application/json"})
    r.raise_for_status()
    row = (r.json().get("data") or [])[0]
    v = int(row["value"])
    cls = row.get("value_classification", "Neutral")
    metrics.record_source("fng", ok=True)
    return FearGreed(value=v, label=_LABELS.get(cls, cls), classification=cls,
                     as_of=_now(), source="alternative.me", error=None)


def _build() -> FearGreed:
    try:
        return _fetch()
    except Exception as e:  # noqa: BLE001
        metrics.record_source("fng", ok=False, error=str(e))
        logger.info("F&G(alternative.me) 실패 → 자체 폴백: %s", e)
        return _self_fallback()


def get_fear_greed() -> FearGreed:
    """성공(alternative.me) 30분 / 폴백 60초 캐시. 외부 실패 시 자체 시장 폭 프록시로 폴백(source 명시)."""
    return cached("trends:fng", lambda r: 60 if r.error else 1800, _build)
