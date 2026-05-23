import logging
import threading
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.logging import request_id, setup_logging
from app.routers import markets, candles, analysis, backtest

setup_logging()
logger = logging.getLogger("upquant")
api_log = logging.getLogger("api")


def _prefetch() -> None:
    """부팅 직후 캐시 워밍: tickers를 한 번 받아 종목별 일봉/스파크라인 캐시를 채운다.
    이후 모든 화면은 stale-while-revalidate로 즉시 응답한다. (실패해도 부팅엔 영향 없음)"""
    try:
        from app.services import market_service
        n = len(market_service.get_tickers())
        logger.info("prefetch 완료: %d개 종목 캐시 워밍", n)
    except Exception as e:  # noqa: BLE001
        logger.warning("prefetch 실패 (서버는 정상 기동): %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_prefetch, daemon=True).start()
    yield


app = FastAPI(title="UPquant", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],  # 프론트가 상관관계 ID를 읽을 수 있도록 노출
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """인바운드(프론트→백) 요청/응답을 한 곳에서 로깅 + rid 발급."""
    rid = uuid4().hex[:8]
    token = request_id.set(rid)
    t0 = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        dur = (time.perf_counter() - t0) * 1000
        api_log.exception("%s %s → ERROR (%.0fms)", request.method, request.url.path, dur)
        request_id.reset(token)
        raise
    dur = (time.perf_counter() - t0) * 1000
    api_log.info("%s %s → %d (%.0fms)", request.method, request.url.path, response.status_code, dur)
    response.headers["X-Request-Id"] = rid
    request_id.reset(token)
    return response


app.include_router(markets.router)
app.include_router(candles.router)
app.include_router(analysis.router)
app.include_router(backtest.router)


@app.get("/health")
def health():
    return {"status": "ok"}
