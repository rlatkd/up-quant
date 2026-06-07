"""인메모리 관측성 메트릭 — 외부 의존성 없이 캐시 적중률·외부 호출수·응답시간을 집계한다.
(프로세스 전역, 단일 인스턴스 전제. cache·logging과 같은 '직접 구현' 관측성 계층.)
"""
import threading
import time
from collections import deque

_lock = threading.Lock()
_started = time.time()
_counters = {
    "cache_hits": 0,         # 신선 캐시 반환
    "cache_stale_serves": 0, # 만료됐지만 옛 값 즉시 반환(백그라운드 갱신)
    "cache_misses": 0,       # 콜드 — 동기 fetch
    "upbit_calls": 0,        # 업비트 REST 호출 수
    "upbit_errors": 0,       # 업비트 호출 실패(예외)
    "cache_revalidate_errors": 0,  # SWR 백그라운드 갱신 실패(stale 값 유지됨)
    "requests": 0,           # 인바운드 요청 수
    "response_ms_total": 0.0,
}
_recent = deque(maxlen=30)   # 최근 요청 (rid·method·path·status·ms)


def incr(key: str, n: int = 1) -> None:
    with _lock:
        _counters[key] = _counters.get(key, 0) + n


def record_request(rid: str, method: str, path: str, status: int, ms: float) -> None:
    with _lock:
        _counters["requests"] += 1
        _counters["response_ms_total"] += ms
        _recent.appendleft({
            "rid": rid, "method": method, "path": path,
            "status": status, "ms": round(ms, 1),
        })


def snapshot() -> dict:
    from app.core import cache  # 지연 import(순환 방지) — 캐시 키 개수 노출
    with _lock:
        hits = _counters["cache_hits"]
        stale = _counters["cache_stale_serves"]
        misses = _counters["cache_misses"]
        served = hits + stale + misses
        reqs = _counters["requests"]
        return {
            "uptime_sec": round(time.time() - _started),
            "cache_hits": hits,
            "cache_stale_serves": stale,
            "cache_misses": misses,
            # 적중률 = (신선+stale 반환) / 전체 캐시 조회. 콜드만 미스.
            "cache_hit_rate": round((hits + stale) / served * 100, 1) if served else 0.0,
            "cache_keys": len(cache._store),
            "upbit_calls": _counters["upbit_calls"],
            "upbit_errors": _counters["upbit_errors"],
            "cache_revalidate_errors": _counters["cache_revalidate_errors"],
            "requests": reqs,
            "avg_response_ms": round(_counters["response_ms_total"] / reqs, 1) if reqs else 0.0,
            "recent": list(_recent),
        }
