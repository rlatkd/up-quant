"""라우터 스모크 테스트 — 앱이 정상 구성되고 네트워크 없이 응답하는 엔드포인트를 확인한다.
주의: TestClient를 컨텍스트 매니저(with) 없이 쓰면 lifespan(부팅 프리페치)이 실행되지 않아
업비트 네트워크 호출 없이 테스트할 수 있다. 그래서 데이터가 필요한 라우트가 아니라
/health·/api/system/metrics 등 인메모리 응답만 검증한다."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)  # with 미사용 → lifespan(프리페치) 미실행


def _auth_client() -> TestClient:
    """로그인해 인증 쿠키를 가진 클라이언트(보호 라우트 호출용)."""
    c = TestClient(app)
    r = c.post("/api/auth/login", data={"username": "test", "password": "test"})
    assert r.status_code == 200
    return c


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "ready" in body  # readiness 플래그 노출


def test_protected_route_requires_auth():
    # 미인증이면 데이터 라우트는 401(전역 가드).
    assert client.get("/api/system/metrics").status_code == 401


def test_login_and_access():
    c = _auth_client()
    r = c.get("/api/system/metrics")
    assert r.status_code == 200
    assert isinstance(r.json(), dict)
    # /me로 사용자 확인
    assert c.get("/api/auth/me").json()["username"] == "test"


def test_login_bad_credentials():
    assert client.post("/api/auth/login", data={"username": "test", "password": "wrong"}).status_code == 401


def test_expected_routes_registered():
    paths = {getattr(r, "path", None) for r in app.routes}
    for p in [
        "/health",
        "/api/markets/tickers",
        "/api/analysis/correlation/{market}",
        "/api/quant/portfolio",
        "/api/backtest/ma-cross",
        "/ws/tickers",
    ]:
        assert p in paths, f"라우트 누락: {p}"
