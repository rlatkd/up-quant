"""설정(core/config) 환경변수 파싱 테스트 — 배포 시 CORS/프리페치 토글이 의도대로 읽히는지."""
from app.core.config import Settings


def test_cors_default_localhost(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert Settings().cors_origins == ["http://localhost:5173"]


def test_cors_csv_env(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://a.com, https://b.com")
    assert Settings().cors_origins == ["https://a.com", "https://b.com"]


def test_cors_json_list_env(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", '["https://c.com","https://d.com"]')
    assert Settings().cors_origins == ["https://c.com", "https://d.com"]


def test_skip_prefetch_default_false(monkeypatch):
    monkeypatch.delenv("SKIP_PREFETCH", raising=False)
    assert Settings().skip_prefetch is False


def test_skip_prefetch_env_true(monkeypatch):
    monkeypatch.setenv("SKIP_PREFETCH", "1")
    assert Settings().skip_prefetch is True
