import logging
import threading
import time

import httpx

from app.core import metrics

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

# ── 레이트리밋 보호 + 포그라운드 우선 ─────────────────────────
# 시세 API는 IP 기준 초당 약 10회 제한. 버스트로 429가 나지 않도록 전역 스로틀 + 재시도.
# 추가로 '포그라운드(사용자 요청) 우선': 백그라운드 워밍/재검증이 261종 팬아웃을 동시에 쏟아내면
# 사용자 요청이 그 뒤에 줄 서서 수십 초 대기하던 문제가 있었다. → ⑴백그라운드 호출은 _bg_lock으로
# 직렬화(동시 버스트 차단) ⑵포그라운드가 대기 중이면 백그라운드는 양보. 포그라운드는 _bg_lock을
# 건너뛰어 항상 다음 슬롯(~0.12s)만 기다린다. (전체 8회/초 상한은 _slot_lock의 슬롯 예약이 보장)
_MIN_INTERVAL = 0.12  # 초당 약 8회
_slot_lock = threading.Lock()
_next_slot = 0.0
_bg_lock = threading.Lock()      # 백그라운드 호출 직렬화(동시 N스레드 버스트 방지)
_fg_lock = threading.Lock()
_fg_pending = 0                  # 대기/진행 중인 포그라운드 호출 수 (백그라운드 양보 신호)

# 백그라운드 스레드 식별 — cache의 SWR 재검증 스레드, main의 주기 워머는 이 이름들로 띄운다.
_BG_THREAD_PREFIXES = ("cache-revalidate", "periodic-warm", "prefetch")


def _is_background() -> bool:
    name = threading.current_thread().name
    return any(name.startswith(p) for p in _BG_THREAD_PREFIXES)


def _reserve_and_sleep() -> None:
    global _next_slot
    with _slot_lock:
        now = time.monotonic()
        slot = max(now, _next_slot)
        _next_slot = slot + _MIN_INTERVAL
    wait = slot - time.monotonic()
    if wait > 0:
        time.sleep(wait)


def _throttle() -> None:
    """전역 8회/초 상한 + 포그라운드 우선. 포그라운드는 백그라운드 버스트 뒤에 줄 서지 않는다."""
    global _fg_pending
    if _is_background():
        # 백그라운드: 한 번에 하나만(직렬화) + 포그라운드가 대기 중이면 먼저 양보.
        with _bg_lock:
            while _fg_pending > 0:
                time.sleep(0.03)
            _reserve_and_sleep()
    else:
        # 포그라운드: 우선. 대기 카운트를 올려 백그라운드가 양보하게 하고, _bg_lock은 건너뛴다.
        with _fg_lock:
            _fg_pending += 1
        try:
            _reserve_and_sleep()
        finally:
            with _fg_lock:
                _fg_pending -= 1


def _get(path: str, params: dict | None = None, retries: int = 3) -> list | dict:
    # 모든 응답 로깅은 클라이언트 event_hook(_log_response)이 공통 처리한다.
    last: httpx.Response | None = None
    for attempt in range(retries):
        _throttle()
        metrics.incr("upbit_calls")
        try:
            last = _client.get(path, params=params)
        except Exception:
            metrics.incr("upbit_errors")
            raise
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
