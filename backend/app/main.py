import asyncio
import json
import logging
import ssl
import threading
import time
from contextlib import asynccontextmanager
from uuid import uuid4

import certifi
import websockets
from fastapi import Depends, FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core import metrics, ratelimit
from app.core.config import settings
from app.core.logging import request_id, setup_logging
from app.core.security import current_user, ws_authenticate
from app.routers import (
    markets, candles, analysis, backtest, quant, system, report, trends, signals, auth,
)

# 보호 라우터 일괄 가드 — 유효한 access 토큰(쿠키/Bearer)이 없으면 401.
_AUTH = [Depends(current_user)]

setup_logging()
logger = logging.getLogger("upquant")
api_log = logging.getLogger("api")


def _prefetch(quiet: bool = False) -> None:
    """부팅 직후 캐시 워밍. 이후 모든 화면은 stale-while-revalidate로 즉시 응답한다.
    (quiet=True는 주기 재워밍 호출 — 완료 로그를 생략한다.)
    핵심 원칙: 대량 팬아웃(수백 콜)은 서버 기동 시 1회만 하고, 이후 어떤 클라이언트가
    들어와도 캐시 히트로 즉시 응답한다. (실패해도 부팅엔 영향 없음)
    - get_tickers(): 현재가 + 종목별 스파크라인(시간봉)
    - get_coin_stats(): 종목별 변동성·1개월수익률(일봉 팬아웃)
    - get_category_monthly(): 섹터 월봉 집계(261종 월봉 팬아웃, 콜드 ~1분, 월별 히트맵용).
    - get_category_daily_cumulative(): 섹터 일봉 동일가중 누적(공용 일봉 캐시 재사용 → 팬아웃 0, 계산만).
    - 퀀트/ML 전역 분석(네트워크·PCA·클러스터·덴드로그램·모멘텀·페어·국면 + 기본 포트폴리오/GARCH):
      일봉은 위에서 캐시돼 추가 fetch 없이 계산만 든다(수초). 첫 방문자도 콜드 없이 즉시 응답."""
    try:
        from app.services import market_service, analysis_service, quant_service, trends_service
        n = len(market_service.get_tickers())
        m = len(analysis_service.get_coin_stats())
        c = len(analysis_service.get_category_monthly().rows)
        analysis_service.get_category_daily_cumulative()
        analysis_service.get_advance_decline()  # A-D 라인(시장 폭) — 공용 일봉 캐시 재사용
        # 트렌드 대시보드(자체 지수·기간수익·시황) — 공용 일봉/월봉 캐시 재사용이라 계산만. (환율·뉴스는 외부라 제외)
        trends_service.get_indices()         # 일봉 + 60분봉(인트라데이) 워밍
        trends_service.get_asset_indices()    # 시장/전략/테마/섹터 지수
        trends_service.get_period_returns()   # 외부 시총(CoinGecko) 포함
        trends_service.get_brief()            # 도미넌스(CoinGecko /global) 포함
        from app.services import signal_service, fx_service, news_service, fng_service, marketcap_service
        signal_service.get_signals()          # 시그널 집계(모멘텀·페어·국면 캐시 합성)
        # 외부 소스도 부팅 때 데워 둔다 → 첫 페이지 진입도 캐시 히트(콜드 빈화면 없음). 실패는
        # 에러 결과를 60초만 캐시하므로 부팅은 안 막히고, 진입 시 SWR이 재시도한다.
        fx_service.get_fx()
        news_service.get_news()
        fng_service.get_fear_greed()
        marketcap_service.get_caps()
        marketcap_service.get_global()
        # 체결강도(WS 1회 수집)는 호출 시 갱신 — 프리페치 제외(WS 1회 ~2초)
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
        if not quiet:
            logger.info(
                "prefetch 완료: tickers %d종 + coin_stats %d종 + 카테고리 월봉(%d개월·일봉누적) "
                "+ 퀀트 9종(네트워크·PCA·클러스터·덴드로·모멘텀·페어·국면·포트폴리오·GARCH) 캐시 워밍",
                n, m, c,
            )
    except Exception as e:  # noqa: BLE001
        logger.warning("prefetch 실패 (서버는 정상 기동): %s", e)


# 주기 재워밍 — 무거운 집계를 만료 직전에 다시 데워 신선도·LRU를 유지한다. 단 한꺼번에 다 데우면
# 그 순간 백그라운드 재검증이 몰리므로(스로틀 점유), 그룹을 잘게 나눠 _WARM_INTERVAL을 분할해
# 한 그룹씩 돌린다(분산). 포그라운드 우선 스로틀(upbit_rest)과 합쳐 사용자 요청을 안 막는다.
# 스레드 이름 'periodic-warm'이라 이 안에서 도는 모든 업비트 호출은 '백그라운드'로 양보된다.
_WARM_INTERVAL = 240  # 초 — 한 사이클(전 그룹) 도는 데 걸리는 시간


def _warm_groups() -> list:
    from app.services import (market_service, analysis_service, quant_service,
                              trends_service, signal_service, fx_service, news_service,
                              fng_service, marketcap_service)
    return [
        lambda: (market_service.get_tickers(), analysis_service.get_coin_stats()),
        lambda: (analysis_service.get_category_monthly(),
                 analysis_service.get_category_daily_cumulative(),
                 analysis_service.get_advance_decline()),
        lambda: (trends_service.get_indices(), trends_service.get_asset_indices(),
                 trends_service.get_period_returns(), trends_service.get_brief()),
        lambda: (fx_service.get_fx(), news_service.get_news(),
                 fng_service.get_fear_greed(), marketcap_service.get_caps(),
                 marketcap_service.get_global()),
        lambda: (quant_service.get_network(), quant_service.get_pca(),
                 quant_service.get_clusters(), quant_service.get_dendrogram()),
        lambda: (quant_service.get_momentum(), quant_service.get_pairs(),
                 quant_service.get_regime(),
                 quant_service.get_portfolio(["KRW-BTC", "KRW-ETH", "KRW-XRP"]),
                 quant_service.get_garch("KRW-BTC")),
        lambda: signal_service.get_signals(),
    ]


def _periodic_warm() -> None:
    groups = _warm_groups()
    gap = _WARM_INTERVAL / len(groups)   # 그룹 사이 간격으로 분산
    idx = 0
    while True:
        time.sleep(gap)
        try:
            groups[idx]()
        except Exception as e:  # noqa: BLE001
            logger.warning("주기 워밍 실패(무시): %s", e)
        idx = (idx + 1) % len(groups)


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
    # 주기 재워밍 데몬 — 무거운 집계를 만료 직전에 갱신해 신선도·LRU 유지(콜드 재팬아웃 방지).
    threading.Thread(target=_periodic_warm, daemon=True, name="periodic-warm").start()
    yield


app = FastAPI(title="UPquant", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,           # HttpOnly 쿠키 인증을 위해 필수(이때 allow_origins는 '*' 불가 → env로 명시)
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],  # 프론트가 상관관계 ID를 읽을 수 있도록 노출
)


@app.middleware("http")
async def rate_limit_and_headers(request: Request, call_next):
    """전역 인바운드 레이트리밋(IP당) + 보안 헤더. 봇/해킹 요청 폭주를 앱 레벨에서 1차 차단해
    AWS 비용 누수를 막는다(엣지 WAF/CloudFront가 1차선, 이건 backstop)."""
    if request.url.path != "/health" and not ratelimit.allow_request(ratelimit.client_ip(request)):
        return JSONResponse({"detail": "요청이 너무 많습니다. 잠시 후 다시 시도하세요."}, status_code=429)
    response = await call_next(request)
    # 보안 헤더 — 클릭재킹·MIME 스니핑·레퍼러 누수 방지. HTTPS 배포 시 HSTS도 추가.
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.cookie_secure:  # HTTPS(배포) 환경에서만 HSTS
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


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


app.include_router(auth.router)  # 인증(로그인/리프레시/me) — 가드 없음
# 데이터 라우터는 전부 로그인 가드(유효 토큰 없으면 401). /health만 예외(가드 밖, readiness용).
app.include_router(markets.router, dependencies=_AUTH)
app.include_router(candles.router, dependencies=_AUTH)
app.include_router(analysis.router, dependencies=_AUTH)
app.include_router(backtest.router, dependencies=_AUTH)
app.include_router(quant.router, dependencies=_AUTH)
app.include_router(system.router, dependencies=_AUTH)
app.include_router(report.router, dependencies=_AUTH)
app.include_router(trends.router, dependencies=_AUTH)
app.include_router(signals.router, dependencies=_AUTH)


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
    # 인증 — 미인증 소켓이 fan-out 루프를 띄워 비용/부하를 키우는 것을 차단(쿠키 또는 ?token=).
    if ws_authenticate(client) is None:
        await client.close(code=1008)  # policy violation
        return
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
    if ws_authenticate(client) is None:
        await client.close(code=1008)  # 미인증 차단
        return
    await client.accept()
    # path의 market을 검증 없이 업비트로 전달하지 않는다 — 상장된 KRW 마켓만 허용(미검증 입력 업스트림 전달 차단).
    from app.services import market_service
    valid = await asyncio.to_thread(market_service.valid_markets)
    if market not in set(valid):
        await client.close(code=1008)  # policy violation
        return
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
