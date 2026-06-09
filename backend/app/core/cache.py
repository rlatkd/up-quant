import threading
import time
from collections import OrderedDict
from typing import Any, Callable

from app.core import metrics

# LRU 상한 — 일부 키가 사용자 파라미터(포트폴리오 종목 조합 등)로 생성돼 무한히 쌓일 수 있으므로
# 상한을 둔다. 정상 워킹셋(종목×캔들 인터벌 ~수천 + 퀀트/카테고리)을 담고도 여유가 있는 크기.
# 초과 시 가장 오래전에 갱신된 키부터 축출(write 시에만 — 읽기 핫패스는 락 없이 유지).
_MAX_KEYS = 5000

_store: "OrderedDict[str, tuple[Any, float]]" = OrderedDict()
_store_lock = threading.Lock()  # _store 변형(set/evict)만 보호. 읽기(get)는 GIL 하 원자라 락 불필요.
# 키별 single-flight 락. 키 집합은 _store와 함께 관리(축출 시 동반 정리)되어 무한 증가하지 않는다.
_locks: dict[str, threading.Lock] = {}
_meta_lock = threading.Lock()


def _key_lock(key: str) -> threading.Lock:
    with _meta_lock:
        lock = _locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _locks[key] = lock
        return lock


def _set(key: str, value: Any, expiry: float) -> None:
    """캐시에 쓰고(최근 사용으로 갱신) 상한 초과분을 축출. 축출된 키의 single-flight 락도 정리."""
    evicted: list[str] = []
    with _store_lock:
        _store[key] = (value, expiry)
        _store.move_to_end(key)              # 최근 갱신 → 뒤로(LRU 꼬리). 콜드/재검증 모두 이 경로.
        while len(_store) > _MAX_KEYS:
            old_key, _ = _store.popitem(last=False)  # 가장 오래된 것부터 축출
            evicted.append(old_key)
    if evicted:
        with _meta_lock:
            for k in evicted:
                _locks.pop(k, None)


def cached(key: str, ttl: int, fetch: Callable[[], Any]) -> Any:
    """stale-while-revalidate 캐시.

    - 신선하면 즉시 반환
    - 만료(stale)면 옛 값을 즉시 반환하고 백그라운드에서 1개 스레드만 갱신(single-flight)
      → 사용자는 만료 시에도 기다리지 않는다.
    - 캐시에 아예 없으면(콜드 스타트)만 동기로 가져온다.
    """
    now = time.time()
    hit = _store.get(key)

    if hit is not None:
        value, expiry = hit
        if expiry > now:
            metrics.incr("cache_hits")
            return value  # 신선
        # stale → 백그라운드 갱신 트리거(이미 갱신 중이면 스킵), 옛 값 즉시 반환
        metrics.incr("cache_stale_serves")
        lock = _key_lock(key)
        if lock.acquire(blocking=False):
            def _revalidate() -> None:
                try:
                    _set(key, fetch(), time.time() + ttl)
                except Exception:
                    metrics.incr("cache_revalidate_errors")  # stale 값은 유지됨
                finally:
                    lock.release()
            threading.Thread(target=_revalidate, daemon=True).start()
        return value

    # 콜드: 동기 fetch (최초 1회)
    metrics.incr("cache_misses")
    data = fetch()
    _set(key, data, now + ttl)
    return data


def clear() -> None:
    with _store_lock:
        _store.clear()
    with _meta_lock:
        _locks.clear()
