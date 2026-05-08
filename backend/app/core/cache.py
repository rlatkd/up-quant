import time
from typing import Any, Awaitable, Callable

_store: dict[str, tuple[Any, float]] = {}


async def cached(key: str, ttl: int, fetch: Callable[[], Awaitable[Any]]) -> Any:
    now = time.time()
    if key in _store and _store[key][1] > now:
        return _store[key][0]
    data = await fetch()
    _store[key] = (data, now + ttl)
    return data
