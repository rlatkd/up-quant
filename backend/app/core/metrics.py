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
# 외부 소스(환율·뉴스·시총·F&G·체결강도 WS) 헬스 — 마지막 성공/실패 시각을 추적해
# /system에서 "며칠째 죽은 소스"를 눈으로 보게 한다(외부 실패를 화면에 숨기지 않는 원칙의 운영판).
_sources: dict[str, dict] = {}


def incr(key: str, n: int = 1) -> None:
    with _lock:
        _counters[key] = _counters.get(key, 0) + n


def record_source(name: str, ok: bool, error: str = "") -> None:
    """외부 소스 호출 결과 기록(성공/실패 + 시각)."""
    with _lock:
        s = _sources.setdefault(name, {"ok": 0, "fail": 0, "last_ok": 0.0, "last_fail": 0.0, "last_error": ""})
        if ok:
            s["ok"] += 1
            s["last_ok"] = time.time()
        else:
            s["fail"] += 1
            s["last_fail"] = time.time()
            s["last_error"] = error[:200]


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
        now = time.time()
        sources = []
        for name, s in sorted(_sources.items()):
            healthy = s["last_ok"] >= s["last_fail"]   # 마지막 시도 기준 정상 여부
            sources.append({
                "name": name,
                "healthy": healthy,
                "ok": s["ok"], "fail": s["fail"],
                "last_ok_age_sec": round(now - s["last_ok"]) if s["last_ok"] else None,
                "last_fail_age_sec": round(now - s["last_fail"]) if s["last_fail"] else None,
                "last_error": s["last_error"],
            })
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
