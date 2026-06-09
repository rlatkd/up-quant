import asyncio
import json
import logging
import ssl
import time
from contextlib import asynccontextmanager
from uuid import uuid4

import certifi
import websockets
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core import metrics
from app.core.config import settings
from app.core.logging import request_id, setup_logging
from app.routers import markets, candles, analysis, backtest, quant, system, report

setup_logging()
logger = logging.getLogger("upquant")
api_log = logging.getLogger("api")


def _prefetch() -> None:
    """부팅 직후 캐시 워밍. 이후 모든 화면은 stale-while-revalidate로 즉시 응답한다.
    핵심 원칙: 대량 팬아웃(수백 콜)은 서버 기동 시 1회만 하고, 이후 어떤 클라이언트가
    들어와도 캐시 히트로 즉시 응답한다. (실패해도 부팅엔 영향 없음)
    - get_tickers(): 현재가 + 종목별 스파크라인(시간봉)
    - get_coin_stats(): 종목별 변동성·1개월수익률(일봉 팬아웃)
    - get_category_monthly(): 섹터 월봉 집계(261종 월봉 팬아웃, 콜드 ~1분, 월별 히트맵용).
    - get_category_daily_cumulative(): 섹터 일봉 동일가중 누적(공용 일봉 캐시 재사용 → 팬아웃 0, 계산만).
    - 퀀트/ML 전역 분석(네트워크·PCA·클러스터·덴드로그램·모멘텀·페어·국면 + 기본 포트폴리오/GARCH):
      일봉은 위에서 캐시돼 추가 fetch 없이 계산만 든다(수초). 첫 방문자도 콜드 없이 즉시 응답."""
    try:
        from app.services import market_service, analysis_service, quant_service
        n = len(market_service.get_tickers())
        m = len(analysis_service.get_coin_stats())
        c = len(analysis_service.get_category_monthly().rows)
        analysis_service.get_category_daily_cumulative()
        analysis_service.get_advance_decline()  # A-D 라인(시장 폭) — 공용 일봉 캐시 재사용
        # 퀀트 전역(파라미터 없는/기본) 분석 워밍.
        quant_service.get_network()
        quant_service.get_pca()
        quant_service.get_clusters()
        quant_service.get_dendrogram()
        quant_service.get_momentum()
        quant_service.get_pairs()
        quant_service.get_regime()
        quant_service.get_portfolio(["KRW-BTC", "KRW-ETH", "KRW-XRP"])
        quant_service.get_garch("KRW-BTC")
        logger.info(
            "prefetch 완료: tickers %d종 + coin_stats %d종 + 카테고리 월봉(%d개월·일봉누적) "
            "+ 퀀트 9종(네트워크·PCA·클러스터·덴드로·모멘텀·페어·국면·포트폴리오·GARCH) 캐시 워밍",
            n, m, c,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("prefetch 실패 (서버는 정상 기동): %s", e)


# 프리페치 워밍 완료 여부 — /health(readiness)에서 노출. dev 스킵 시엔 곧장 ready로 둔다.
_ready = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _ready
    if settings.skip_prefetch:
        # dev 편의: SKIP_PREFETCH=1이면 워밍을 건너뛰어 리로드마다 1~2분 대기를 없앤다.
        # (첫 방문 화면은 콜드 fetch로 잠깐 느릴 수 있으나 개발 루프가 빨라진다.)
        logger.info("SKIP_PREFETCH=1 → 부팅 프리페치 건너뜀(dev). 첫 요청은 콜드일 수 있음.")
        _ready = True
        yield
        return
    # 워밍이 끝난 뒤 기동(blocking). 기동은 1~2분 느려지지만 첫 사용자도 콜드 없이 즉시 응답.
    # 동기 httpx 호출이라 to_thread로 이벤트루프 밖에서 실행하되, 완료까지 대기한다.
    await asyncio.to_thread(_prefetch)
    _ready = True
    yield


app = FastAPI(title="UPquant", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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
        metrics.record_request(rid, request.method, request.url.path, 500, dur)
        request_id.reset(token)
        raise
    dur = (time.perf_counter() - t0) * 1000
    api_log.info("%s %s → %d (%.0fms)", request.method, request.url.path, response.status_code, dur)
    metrics.record_request(rid, request.method, request.url.path, response.status_code, dur)
    response.headers["X-Request-Id"] = rid
    request_id.reset(token)
    return response


app.include_router(markets.router)
app.include_router(candles.router)
app.include_router(analysis.router)
app.include_router(backtest.router)
app.include_router(quant.router)
app.include_router(system.router)
app.include_router(report.router)


@app.get("/health")
def health():
    # readiness: 프리페치 워밍이 끝나야 캐시 히트로 즉시 응답 가능한 "준비됨" 상태.
    # 워밍 중에는 ready=false라 로드밸런서/오케스트레이터가 트래픽을 늦게 보낼 수 있다.
    return {"status": "ok", "ready": _ready}


# ── 실시간 시세 중계 (업비트 WebSocket → 프론트) ────────────────
# 성능 원칙: 클라이언트가 몇이 붙든 업비트 WS는 "단 1개"만 유지하고, 받은 메시지를 모든
# 클라이언트에 fan-out한다(클라이언트당 업비트 연결을 새로 열면 다중 탭/인스턴스에서 연결이
# N개로 늘어 비효율). 신규 클라이언트엔 최신 스냅샷(latest)을 먼저 보내 즉시 화면이 채워지게 한다.
_UPBIT_WS = "wss://api.upbit.com/websocket/v1"
# macOS 프레임워크 Python은 기본 CA 번들(cert.pem)이 깨진 심링크라 TLS 검증이 0개 CA로 실패한다
# (REST httpx는 자체 certifi를 써서 무사). websockets에도 certifi 기반 컨텍스트를 명시해 환경 비의존적으로 검증한다.
_SSL_CTX = ssl.create_default_context(cafile=certifi.where())


class TickerHub:
    """업비트 ticker WS 1개를 구독자(클라이언트) 전체에 중계하는 공유 허브."""

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.latest: dict[str, dict] = {}   # market → 최신 메시지 (신규 클라이언트 스냅샷용)
        self.task: asyncio.Task | None = None

    async def add(self, ws: WebSocket) -> None:
        self.clients.add(ws)
        # 최신 스냅샷 즉시 푸시 — REST 응답을 기다리지 않고 바로 시세가 채워진다.
        for msg in list(self.latest.values()):
            try:
                await ws.send_json(msg)
            except Exception:  # noqa: BLE001
                break
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._run())

    def remove(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def _run(self) -> None:
        """구독자가 있는 동안 업비트 WS를 유지하며 fan-out. 끊기면 재연결."""
        from app.services import market_service
        markets = await asyncio.to_thread(market_service.valid_markets)
        req = json.dumps([{"ticket": "upquant"}, {"type": "ticker", "codes": markets}])
        backoff = 2  # 재연결 지수 백오프(초) — 연속 실패 시 늘려 업비트 부하/로그 폭주 방지, 연결 성공 시 리셋
        while self.clients:
            try:
                async with websockets.connect(_UPBIT_WS, ping_interval=20, max_size=None, ssl=_SSL_CTX) as upbit:
                    await upbit.send(req)
                    backoff = 2
                    api_log.info("ticker hub: 업비트 WS 연결 (구독자 %d)", len(self.clients))
                    async for raw in upbit:
                        if not self.clients:
                            break
                        d = json.loads(raw)  # 업비트는 binary frame(JSON)
                        msg = {
                            "market": d["code"],
                            "trade_price": d["trade_price"],
                            "change": d["change"],                  # RISE | FALL | EVEN
                            "change_rate": d["signed_change_rate"],  # 부호 있음
                            "change_price": d["change_price"],
                            "acc_trade_price_24h": d["acc_trade_price_24h"],
                        }
                        self.latest[d["code"]] = msg
                        for c in list(self.clients):
                            try:
                                await c.send_json(msg)
                            except Exception:  # noqa: BLE001 — 끊긴 클라이언트 정리
                                self.clients.discard(c)
            except Exception as e:  # noqa: BLE001 — 업비트 끊김 → 지수 백오프 후 재연결
                api_log.warning("ticker hub: 업비트 WS %ds 후 재연결 (%s)", backoff, e)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)  # 2→4→8→16→30(상한)
        api_log.info("ticker hub: 구독자 0 → 업비트 WS 중단")


_ticker_hub = TickerHub()


@app.websocket("/ws/tickers")
async def ws_tickers(client: WebSocket):
    await client.accept()
    await _ticker_hub.add(client)
    try:
        # 클라이언트가 보내는 건 없지만, 연결 종료를 감지하려면 수신 대기해야 한다.
        while True:
            await client.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _ticker_hub.remove(client)


@app.websocket("/ws/market/{market}")
async def ws_market(client: WebSocket, market: str):
    """코인 상세용 — 한 종목의 호가(orderbook)·체결(trade)을 실시간 중계.
    종목별 on-demand(상세를 열 때만)라 클라이언트당 1연결. ticker(전체)와 달리 공유 허브가 불필요."""
    await client.accept()
    req = json.dumps([
        {"ticket": "upquant"},
        {"type": "orderbook", "codes": [market]},
        {"type": "trade", "codes": [market]},
    ])
    try:
        async with websockets.connect(_UPBIT_WS, ping_interval=20, max_size=None, ssl=_SSL_CTX) as upbit:
            await upbit.send(req)
            async for raw in upbit:
                d = json.loads(raw)
                typ = d.get("type")
                if typ == "orderbook":
                    units = d.get("orderbook_units", [])
                    await client.send_json({
                        "type": "orderbook",
                        "asks": [{"price": u["ask_price"], "size": u["ask_size"]} for u in units],
                        "bids": [{"price": u["bid_price"], "size": u["bid_size"]} for u in units],
                    })
                elif typ == "trade":
                    await client.send_json({
                        "type": "trade",
                        "timestamp": int(d["trade_timestamp"] // 1000),
                        "price": d["trade_price"],
                        "volume": d["trade_volume"],
                        "side": d["ask_bid"],  # ASK | BID
                    })
    except (WebSocketDisconnect, websockets.ConnectionClosed):
        pass
    except Exception as e:  # noqa: BLE001
        api_log.warning("ws_market(%s) 종료: %s", market, e)
