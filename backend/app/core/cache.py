import threading
import time
from typing import Any, Callable

_store: dict[str, tuple[Any, float]] = {}
_locks: dict[str, threading.Lock] = {}
_meta_lock = threading.Lock()


def _key_lock(key: str) -> threading.Lock:
    with _meta_lock:
        lock = _locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _locks[key] = lock
        return lock


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
            return value  # 신선
        # stale → 백그라운드 갱신 트리거(이미 갱신 중이면 스킵), 옛 값 즉시 반환
        lock = _key_lock(key)
        if lock.acquire(blocking=False):
            def _revalidate() -> None:
                try:
                    _store[key] = (fetch(), time.time() + ttl)
                except Exception:
                    pass
                finally:
                    lock.release()
            threading.Thread(target=_revalidate, daemon=True).start()
        return value

    # 콜드: 동기 fetch (최초 1회)
    data = fetch()
    _store[key] = (data, now + ttl)
    return data


def clear() -> None:
    _store.clear()
