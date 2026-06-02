import logging
import threading
import time

import httpx

logger = logging.getLogger("upbit")

_BASE = "https://api.upbit.com/v1"


def _on_request(request: httpx.Request) -> None:
    request.extensions["start"] = time.monotonic()


def _log_response(response: httpx.Response) -> None:
    """모든 Upbit 요청/응답을 한 곳에서 로깅 (서블릿 필터/인터셉터 역할)."""
    start = response.request.extensions.get("start")
    ms = f"{(time.monotonic() - start) * 1000:.0f}ms" if start else "?"
    path = str(response.request.url).replace(_BASE, "")
    logger.info("%s %s → %d (%s)", response.request.method, path, response.status_code, ms)


_client = httpx.Client(
    base_url=_BASE,
    timeout=httpx.Timeout(10.0),
    event_hooks={"request": [_on_request], "response": [_log_response]},
)

# ── 레이트리밋 보호 ──────────────────────────────────────────
# 시세 API는 IP 기준 초당 약 10회 제한. 버스트로 429가 나지 않도록 전역 스로틀 + 재시도.
_MIN_INTERVAL = 0.12  # 초당 약 8회
_lock = threading.Lock()
_next_slot = 0.0


def _throttle() -> None:
    """전역으로 호출 간격을 _MIN_INTERVAL 이상 벌린다 (슬롯 예약은 락 안, 대기는 락 밖)."""
    global _next_slot
    with _lock:
        now = time.monotonic()
        slot = max(now, _next_slot)
        _next_slot = slot + _MIN_INTERVAL
    wait = slot - time.monotonic()
    if wait > 0:
        time.sleep(wait)


def _get(path: str, params: dict | None = None, retries: int = 3) -> list | dict:
    # 모든 응답 로깅은 클라이언트 event_hook(_log_response)이 공통 처리한다.
    last: httpx.Response | None = None
    for attempt in range(retries):
        _throttle()
        last = _client.get(path, params=params)
        if last.status_code == 429:  # 한도 초과 → 백오프 후 재시도
            time.sleep(0.5 * (attempt + 1))
            continue
        last.raise_for_status()
        return last.json()

    assert last is not None
    last.raise_for_status()
    return last.json()


def get_market_all(is_details: bool = False) -> list[dict]:
    return _get("/market/all", {"is_details": str(is_details).lower()})


def get_tickers(markets: list[str]) -> list[dict]:
    return _get("/ticker", {"markets": ",".join(markets)})


def get_candles(interval: str, market: str, count: int = 200, to: str | None = None) -> list[dict]:
    """interval: 'minutes/3' | 'days' | 'weeks' | 'months'. 최신순으로 반환된다."""
    if interval.startswith("minutes"):
        unit = interval.split("/")[1] if "/" in interval else "1"
        path = f"/candles/minutes/{unit}"
    else:
        path = f"/candles/{interval}"
    params: dict = {"market": market, "count": min(count, 200)}
    if to:
        params["to"] = to
    try:
        return _get(path, params)
    except httpx.HTTPStatusError as e:
        # 상폐/미존재 종목은 404 → 캔들 없음으로 처리(전체 집계가 한 종목 때문에 죽지 않도록).
        if e.response.status_code == 404:
            return []
        raise


def get_orderbook(market: str) -> dict | None:
    data = _get("/orderbook", {"markets": market})
    return data[0] if data else None


def get_trades(market: str, count: int = 20) -> list[dict]:
    return _get("/trades/ticks", {"market": market, "count": min(count, 500)})
