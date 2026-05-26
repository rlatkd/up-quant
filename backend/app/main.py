import asyncio
import logging
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
    """부팅 직후 캐시 워밍. 이후 모든 화면은 stale-while-revalidate로 즉시 응답한다.
    핵심 원칙: 대량 팬아웃(수백 콜)은 서버 기동 시 1회만 하고, 이후 어떤 클라이언트가
    들어와도 캐시 히트로 즉시 응답한다. (실패해도 부팅엔 영향 없음)
    - get_tickers(): 현재가 + 종목별 스파크라인(시간봉)
    - get_coin_stats(): 종목별 변동성·1개월수익률(일봉 팬아웃)
    - get_category_monthly()/cumulative(): 섹터 월봉 집계(261종 월봉 팬아웃, 콜드 ~1분).
      monthly가 월봉 series를 캐시하면 cumulative 3종은 그 series를 재사용하므로 fetch는 1회."""
    try:
        from app.services import market_service, analysis_service
        n = len(market_service.get_tickers())
        m = len(analysis_service.get_coin_stats())
        c = len(analysis_service.get_category_monthly().rows)
        for period in ("월", "분기", "년"):
            analysis_service.get_category_cumulative(period)
        logger.info(
            "prefetch 완료: tickers %d종 + coin_stats %d종 + 카테고리 월봉(%d개월·누적3종) 캐시 워밍",
            n, m, c,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("prefetch 실패 (서버는 정상 기동): %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 워밍이 끝난 뒤 기동(blocking). 기동은 1~2분 느려지지만 첫 사용자도 콜드 없이 즉시 응답.
    # 동기 httpx 호출이라 to_thread로 이벤트루프 밖에서 실행하되, 완료까지 대기한다.
    await asyncio.to_thread(_prefetch)
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
