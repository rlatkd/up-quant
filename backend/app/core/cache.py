import threading
import time
from collections import OrderedDict
from typing import Any, Callable

from app.core import metrics

# LRU 상한 — 일부 키가 사용자 파라미터(포트폴리오 종목 조합 등)로 생성돼 무한히 쌓일 수 있으므로
# 상한을 둔다. 261종 × (일/주/월봉 + 인터벌별 분봉 + 상관·GARCH) + 퀀트/카테고리를 코인 상세를
# 많이 돌아다녀도 여유 있게 담도록 크게 잡는다(과거 5000은 헤비 브라우징 시 일봉 canonical을
# 축출해 다음 집계가 콜드 재팬아웃되는 약점이 있었음).
_MAX_KEYS = 20000

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


def _touch(key: str) -> None:
    """읽기 적중 시 LRU 꼬리로 이동(최근 사용 표시). 과거엔 읽기가 LRU 순서를 갱신하지 않아
    '자주 읽기만 하는' 일봉 canonical 키가 새 키에 밀려 축출되는 문제가 있었다 → 읽기도 사용으로 친다.
    (O(1) move, GIL 하 짧은 락. 키가 그 사이 축출됐으면 무시.)"""
    with _store_lock:
        try:
            _store.move_to_end(key)
        except KeyError:
            pass


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


def _resolve_ttl(ttl: "int | float | Callable[[Any], float]", data: Any) -> float:
    """TTL이 콜러블이면 결과로 계산(외부 소스: 성공은 길게·에러는 짧게 캐시하려고)."""
    return float(ttl(data)) if callable(ttl) else float(ttl)


def cached(key: str, ttl: "int | float | Callable[[Any], float]", fetch: Callable[[], Any]) -> Any:
    """stale-while-revalidate 캐시.

    - 신선하면 즉시 반환
    - 만료(stale)면 옛 값을 즉시 반환하고 백그라운드에서 1개 스레드만 갱신(single-flight)
      → 사용자는 만료 시에도 기다리지 않는다.
    - 캐시에 아예 없으면(콜드 스타트)만 동기로 가져온다.
    - ttl이 콜러블이면 fetch 결과로 TTL을 정한다(예: 외부 소스 성공 600s / 에러 60s).
    """
    now = time.time()
    hit = _store.get(key)

    if hit is not None:
        value, expiry = hit
        _touch(key)        # 읽기도 '사용'으로 쳐 LRU 꼬리로(핫 키 축출 방지)
        if expiry > now:
            metrics.incr("cache_hits")
            return value  # 신선
        # stale → 백그라운드 갱신 트리거(이미 갱신 중이면 스킵), 옛 값 즉시 반환
        metrics.incr("cache_stale_serves")
        lock = _key_lock(key)
        if lock.acquire(blocking=False):
            def _revalidate() -> None:
                try:
                    val = fetch()
                    _set(key, val, time.time() + _resolve_ttl(ttl, val))
                except Exception:
                    metrics.incr("cache_revalidate_errors")  # stale 값은 유지됨
                finally:
                    lock.release()
            # 스레드 이름 'cache-revalidate'로 띄워 upbit 스로틀이 '백그라운드'로 인식 → 포그라운드에 양보.
            threading.Thread(target=_revalidate, daemon=True, name="cache-revalidate").start()
        return value

    # 콜드: 동기 fetch (최초 1회). 같은 키에 동시 첫 방문이 여럿이면 한 스레드만 fetch하고
    # 나머지는 그 결과를 기다린다(single-flight) — 안 그러면 콜드 키마다 업비트를 N번 때린다.
    lock = _key_lock(key)
    with lock:
        # 락 획득 대기 중 다른 스레드가 이미 채웠을 수 있다 → 재확인 후 재사용.
        hit = _store.get(key)
        if hit is not None and hit[1] > time.time():
            metrics.incr("cache_hits")
            return hit[0]
        metrics.incr("cache_misses")
        data = fetch()
        _set(key, data, time.time() + _resolve_ttl(ttl, data))
        return data


def clear() -> None:
    with _store_lock:
        _store.clear()
    with _meta_lock:
        _locks.clear()
