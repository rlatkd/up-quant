"""시가총액 — 업비트 시세 API는 시총(유통량)을 제공하지 않으므로 외부(CoinGecko 무료 API)에서 가져온다.
심볼(BTC 등)로 업비트 KRW 마켓에 매핑. 업비트 코인동향의 '시가총액' 탭 미러.
⚠️ 외부 소스라 실패 시 빈 맵 반환(시총 컬럼은 '—'로 표시). 캐시 장기(시총은 분 단위로 거의 안 변함)."""
import logging

import httpx

from app.core import metrics
from app.core.cache import cached

logger = logging.getLogger("upquant")
_URL = "https://api.coingecko.com/api/v3/coins/markets"
_GLOBAL_URL = "https://api.coingecko.com/api/v3/global"


def _fetch() -> dict[str, tuple[float, int]]:
    # KRW 기준 시총 상위 500(2페이지) — 심볼 대문자 → (시총, 순위). 업비트 알트가 글로벌 상위 250 밖이라 500까지.
    # market_cap_desc라 동일 심볼이면 큰 쪽이 먼저(보통 정답).
    out: dict[str, tuple[float, int]] = {}
    for page in (1, 2):
        r = httpx.get(_URL, timeout=4.0, headers={"Accept": "application/json"},
                      params={"vs_currency": "krw", "order": "market_cap_desc",
                              "per_page": 250, "page": page, "sparkline": "false"})
        r.raise_for_status()
        for c in r.json():
            sym = (c.get("symbol") or "").upper()
            cap = c.get("market_cap")
            if sym and sym not in out and cap:
                out[sym] = (float(cap), int(c.get("market_cap_rank") or 0))
    metrics.record_source("marketcap", ok=True)
    return out


def _build_caps() -> dict[str, tuple[float, int]]:
    try:
        return _fetch()
    except Exception as e:  # noqa: BLE001
        metrics.record_source("marketcap", ok=False, error=str(e))
        logger.info("marketcap(CoinGecko) 실패: %s", e)
        return {}


def get_caps() -> dict[str, tuple[float, int]]:
    """심볼 대문자 → (시가총액 KRW, 순위). 성공 1시간 / 실패(빈 맵) 60초 캐시(매 진입 재-매달림 방지)."""
    return cached("trends:marketcap", lambda r: 3600 if r else 60, _build_caps)


def _fetch_global() -> dict:
    # CoinGecko /global — 업계 표준 BTC 도미넌스(=BTC 시총 / 전체 암호화폐 시총)를 직접 제공.
    # (우리가 받는 상위 500 시총 합이 아니라 '전 세계' 시총 기준이라 진짜 도미넌스다.)
    r = httpx.get(_GLOBAL_URL, timeout=4.0, headers={"Accept": "application/json"})
    r.raise_for_status()
    d = r.json().get("data", {})
    pct = d.get("market_cap_percentage", {}) or {}
    total = d.get("total_market_cap", {}) or {}
    metrics.record_source("global", ok=True)
    return {
        "btc_dominance": round(float(pct.get("btc", 0.0)), 1),
        "eth_dominance": round(float(pct.get("eth", 0.0)), 1),
        "total_mcap_krw": float(total.get("krw", 0.0)),
    }


def _build_global() -> dict:
    try:
        return _fetch_global()
    except Exception as e:  # noqa: BLE001
        metrics.record_source("global", ok=False, error=str(e))
        logger.info("global(CoinGecko) 실패: %s", e)
        return {}


def get_global() -> dict:
    """전 세계 시총 기준 BTC/ETH 도미넌스 + 총 시총(KRW). 성공 1시간 / 실패(빈 맵) 60초 캐시."""
    return cached("trends:global", lambda r: 3600 if r else 60, _build_global)
