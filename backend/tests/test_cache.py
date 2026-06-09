"""캐시(core/cache) 동작 회귀 테스트 — stale-while-revalidate + single-flight.
네트워크 없이 합성 fetch로 검증한다(콜드/신선/stale/단일갱신)."""
import threading
import time

from app.core import cache


def test_cold_miss_fetches_once_then_fresh_hit():
    cache.clear()
    calls = {"n": 0}

    def fetch():
        calls["n"] += 1
        return "v1"

    assert cache.cached("k", 60, fetch) == "v1"  # 콜드: 동기 fetch
    assert cache.cached("k", 60, fetch) == "v1"  # 신선: 캐시 히트
    assert calls["n"] == 1  # fetch는 콜드 1회뿐


def test_stale_serves_old_value_then_revalidates_in_background():
    cache.clear()
    state = {"v": "v1", "n": 0}

    def fetch():
        state["n"] += 1
        return state["v"]

    # ttl=0 → 저장 즉시 만료(stale)되도록.
    assert cache.cached("k", 0, fetch) == "v1"  # 콜드
    state["v"] = "v2"
    # stale: 옛 값을 즉시 반환(기다리지 않음) + 백그라운드 갱신 트리거
    assert cache.cached("k", 60, fetch) == "v1"
    # 백그라운드 스레드가 v2로 갱신할 때까지 대기
    for _ in range(100):
        if cache._store["k"][0] == "v2":
            break
        time.sleep(0.02)
    assert cache.cached("k", 60, fetch) == "v2"  # 갱신 후 신선


def test_lru_evicts_oldest_over_capacity(monkeypatch):
    cache.clear()
    monkeypatch.setattr(cache, "_MAX_KEYS", 3)
    for i in range(5):
        cache.cached(f"k{i}", 60, lambda i=i: i)   # 콜드 5개 삽입(상한 3)
    # 가장 오래된 k0·k1은 축출, 최근 3개만 남는다.
    assert set(cache._store.keys()) == {"k2", "k3", "k4"}
    assert "k0" not in cache._locks and "k1" not in cache._locks   # 락도 동반 정리


def test_revalidation_refreshes_lru_position(monkeypatch):
    cache.clear()
    monkeypatch.setattr(cache, "_MAX_KEYS", 3)
    for i in range(3):
        cache.cached(f"k{i}", 0, lambda i=i: i)     # ttl=0 → 즉시 stale
    cache.cached("k0", 60, lambda: 0)               # k0 stale 접근 → 백그라운드 갱신(꼬리로 이동)
    for _ in range(50):
        if cache._store and next(iter(cache._store)) != "k0":
            break
        time.sleep(0.02)
    cache.cached("k3", 60, lambda: 3)               # 새 키 → 가장 오래된 것(k1) 축출, k0은 생존
    assert "k0" in cache._store


def test_single_flight_skips_concurrent_revalidation():
    cache.clear()
    calls = {"n": 0}
    gate = threading.Event()

    def fetch():
        calls["n"] += 1
        gate.wait(2)  # 갱신 스레드를 묶어둬 동시 stale 호출이 락을 못 잡게 한다
        return "v"

    gate.set()
    cache.cached("k", 0, fetch)  # 콜드(n=1), 즉시 stale 상태로 저장
    gate.clear()

    # 여러 stale 호출을 빠르게: 첫 호출만 락을 잡고 갱신 스레드 1개 시작(블록), 나머지는 스킵
    for _ in range(5):
        assert cache.cached("k", 60, fetch) == "v"  # 모두 옛 값 즉시 반환
    time.sleep(0.1)
    assert calls["n"] == 2  # 콜드(1) + 갱신 1개만(single-flight)

    gate.set()  # 정리
    time.sleep(0.1)
