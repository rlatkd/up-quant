"""시가총액 — 업비트 시세 API는 시총(유통량)을 제공하지 않으므로 외부(CoinGecko 무료 API)에서 가져온다.
심볼(BTC 등)로 업비트 KRW 마켓에 매핑. 업비트 코인동향의 '시가총액' 탭 미러.
⚠️ 외부 소스라 실패 시 빈 맵 반환(시총 컬럼은 '—'로 표시). 캐시 장기(시총은 분 단위로 거의 안 변함)."""
import logging

import httpx

from app.core.cache import cached

logger = logging.getLogger("upquant")
_URL = "https://api.coingecko.com/api/v3/coins/markets"


def _fetch() -> dict[str, tuple[float, int]]:
    # KRW 기준 시총 상위 500(2페이지) — 심볼 대문자 → (시총, 순위). 업비트 알트가 글로벌 상위 250 밖이라 500까지.
    # market_cap_desc라 동일 심볼이면 큰 쪽이 먼저(보통 정답).
    out: dict[str, tuple[float, int]] = {}
    for page in (1, 2):
        r = httpx.get(_URL, timeout=10.0, headers={"Accept": "application/json"},
                      params={"vs_currency": "krw", "order": "market_cap_desc",
                              "per_page": 250, "page": page, "sparkline": "false"})
        r.raise_for_status()
        for c in r.json():
            sym = (c.get("symbol") or "").upper()
            cap = c.get("market_cap")
            if sym and sym not in out and cap:
                out[sym] = (float(cap), int(c.get("market_cap_rank") or 0))
    return out


def get_caps() -> dict[str, tuple[float, int]]:
    """심볼 대문자 → (시가총액 KRW, 순위). 실패 시 빈 맵(시총 컬럼은 '—')."""
    try:
        return cached("trends:marketcap", 3600, _fetch)
    except Exception as e:  # noqa: BLE001
        logger.info("marketcap(CoinGecko) 실패: %s", e)
        return {}
