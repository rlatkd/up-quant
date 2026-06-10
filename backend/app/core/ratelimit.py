"""인메모리 레이트리밋 — 외부 의존성 없이 IP당 요청 폭주/로그인 브루트포스를 1차 차단한다.

목적: AWS 배포 시 봇/해킹 요청이 쏟아져 비용이 새는 것을 앱 레벨에서 막는 backstop.
⚠️ 단일 인스턴스 전역(인메모리)이라 멀티 인스턴스에선 인스턴스별로 동작한다. 진짜 DDoS 방어선은
CloudFront/WAF/ALB(엣지)이며, 이 모듈은 그 앞단이 뚫렸을 때의 마지막 캡이다.
"""
import threading
import time

from app.core.config import settings


class _TokenBucket:
    """IP당 토큰버킷 — capacity 버스트 허용, 분당 rate로 리필."""

    def __init__(self, capacity: int, refill_per_sec: float) -> None:
        self.capacity = capacity
        self.refill = refill_per_sec
        self.lock = threading.Lock()
        self.buckets: dict[str, tuple[float, float]] = {}   # ip -> (tokens, last_ts)

    def allow(self, ip: str) -> bool:
        now = time.monotonic()
        with self.lock:
            tokens, last = self.buckets.get(ip, (float(self.capacity), now))
            tokens = min(self.capacity, tokens + (now - last) * self.refill)
            if tokens < 1.0:
                self.buckets[ip] = (tokens, now)
                return False
            self.buckets[ip] = (tokens - 1.0, now)
            return True

    def cleanup(self, max_ips: int = 50000) -> None:
        # 메모리 상한 — IP 키가 무한 증가하지 않게 가득 차면 비운다(완전 가득 찬 버킷부터 손실 무시).
        with self.lock:
            if len(self.buckets) > max_ips:
                self.buckets.clear()


_global_bucket = _TokenBucket(
    capacity=settings.rate_limit_per_min,
    refill_per_sec=settings.rate_limit_per_min / 60.0,
)


def allow_request(ip: str) -> bool:
    """전역 인바운드 레이트리밋 — 허용 여부."""
    _global_bucket.cleanup()
    return _global_bucket.allow(ip)


# ── 로그인 브루트포스 제한 ────────────────────────────────────
_login_lock = threading.Lock()
_login_state: dict[str, dict] = {}   # ip -> {fails, first_ts, locked_until}


def login_blocked(ip: str) -> int:
    """현재 잠금 중이면 남은 잠금 초, 아니면 0."""
    now = time.time()
    with _login_lock:
        st = _login_state.get(ip)
        if st and st["locked_until"] > now:
            return int(st["locked_until"] - now)
    return 0


def record_login_failure(ip: str) -> None:
    now = time.time()
    with _login_lock:
        st = _login_state.get(ip)
        if not st or now - st["first_ts"] > settings.login_window_sec:
            st = {"fails": 0, "first_ts": now, "locked_until": 0.0}
        st["fails"] += 1
        if st["fails"] >= settings.login_max_attempts:
            st["locked_until"] = now + settings.login_lock_sec
        _login_state[ip] = st


def record_login_success(ip: str) -> None:
    with _login_lock:
        _login_state.pop(ip, None)


def client_ip(request) -> str:
    """프록시(ALB/CloudFront) 뒤에서는 X-Forwarded-For의 첫 IP를, 아니면 소켓 IP를 쓴다."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
