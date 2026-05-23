import time
from typing import Any, Callable

_store: dict[str, tuple[Any, float]] = {}


def cached(key: str, ttl: int, fetch: Callable[[], Any]) -> Any:
    """TTL 메모리 캐시. key가 살아있으면 캐시값을 반환하고, 만료/부재면 fetch() 결과를 저장 후 반환."""
    now = time.time()
    hit = _store.get(key)
    if hit and hit[1] > now:
        return hit[0]
    data = fetch()
    _store[key] = (data, now + ttl)
    return data


def clear() -> None:
    _store.clear()
