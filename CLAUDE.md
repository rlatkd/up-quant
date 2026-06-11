# CLAUDE.md

이 파일은 Claude Code(및 협업자)가 이 레포에서 작업할 때 참조하는 규칙·구조·이력 문서입니다. 어느 PC에서든 세션 시작 시 자동 로드됩니다. (이전의 `HANDOFF.md`(세션 인계)·`docs/HISTORY.md`(작업 이력)를 이 문서 하단으로 통합했습니다. 개요/스크린샷은 `README.md`, API 명세는 `references/API.md`, 계획서는 `references/프로젝트계획서.md`.)

## 프로젝트

**UPquant** — 업비트(Upbit) KRW 마켓 암호화폐 분석 대시보드. 백엔드(FastAPI) + 프론트(React/Vite) 모노레포.
시세 탐색 + 카테고리 분석 + 종목 비교 + 전략 백테스트 + 조건 스크리닝.

## 실행

```bash
# 백엔드 (venv: backend/.venv)
cd backend && .venv/bin/fastapi dev app/main.py     # → :8000, /docs
cd backend && SKIP_PREFETCH=1 .venv/bin/fastapi dev app/main.py  # dev: 부팅 워밍 건너뜀(리로드마다 1~2분 대기 제거, 첫 요청만 콜드)
# 프론트
cd frontend && npm run dev                          # → :5173
```
Node는 22.x(nvm) 사용. 두 서버를 함께 실행해야 함(프론트가 `http://localhost:8000` 호출, CORS는 `:5173` 허용).
- **환경변수(배포·이식)**: 프론트 `VITE_API_BASE`/`VITE_WS_BASE`(미지정 시 localhost:8000, `frontend/.env.example` 참고), 백엔드 `CORS_ORIGINS`(콤마 또는 JSON 리스트)·`SKIP_PREFETCH`. 로컬은 전부 기본값으로 동작.

## 아키텍처 (Spring 유사 계층, 단방향)

```
Frontend:  pages/ → hooks/ → api/(axios)
Backend:   routers/(≈Controller) → services/(≈Service, +캐시) → clients/(≈Repository, httpx)
                                                                      ↓
                                                          Upbit Open API (api.upbit.com/v1)
```

## 데이터 소스 (중요)

- **외부 의존(트렌드 대시보드 한정, Phase 29·31)**: 업비트 시세 외에 ⑴**환율** = 현재가 `open.er-api.com`(무료·무인증, 10분 캐시) + **추이 차트(Phase 35)** = `api.frankfurter.dev/v1`(ECB 일별, 무인증, 최근 ~32영업일 KRW/단위 시계열 6h 캐시 — 통화별 X/Y축 라인차트; frankfurter.app은 301 폐기) ⑵**뉴스** = 한국 크립토 RSS 통합(블록미디어·토큰포스트·**블록체인투데이** — 코인데스크코리아 RSS는 HTML 페이지 반환으로 폐기돼 Phase 35에서 교체; HTML 응답 가드 + bare`&`/제어문자 새니타이즈) ⑶**시가총액** = `CoinGecko /coins/markets`(상위 500, 심볼 매핑 ~156/263) ⑷**도미넌스(Phase 31)** = `CoinGecko /global`의 `market_cap_percentage.btc`(=시총 기준 업계 표준, 거래대금 비중 아님 — 실패 시 거래대금 비중으로 폴백·라벨로 출처 명시) ⑸**공포·탐욕(Phase 31)** = `alternative.me` Crypto Fear&Greed(실패 시 자체 시장 폭 프록시 폴백·'자체' 표식, `fng_service`). **공통 원칙: 외부 실패 시 숨기지 않고 "⚠️ 소스 교체 필요" 노출** + **에러 결과를 60초만 캐시(callable TTL)**+httpx 타임아웃 4초(Phase 32 — 죽은 소스에 매 진입 재-매달림 방지) + **부팅 프리페치 포함**(첫 화면도 캐시 히트). 그 외(자체 시장지수·인트라데이·체결강도·기간수익·시황)는 전부 업비트 시세 기반. **체결강도** = 업비트 WS 티커의 `acc_ask_volume`/`acc_bid_volume`(REST엔 없음, **당일 누적**이라 순간압력 아님·라벨 명시) 1회 스냅샷 → 매수/매도×100. ⚠️**WS 수집 4초 deadline**(Phase 34 — 종료조건을 '전종목 수집'에만 맡기면 일부 종목 `acc_ask_volume==0`+활발한 시장에서 무한 수집 행이 났음) + **부팅 프리페치 포함**(Phase 35 — 시장 동향 첫 진입 빈 영역 제거, WS 1회라 +4초). **인트라데이 당일/전일** = 60분봉 자체 동일가중(구성 상한 40).

- **업비트 시세(Quotation) REST API**로 실연동. **인증/API Key 불필요** (거래소 API 아님).
- 사용 엔드포인트: `/market/all`, `/ticker`, `/candles/*`, `/orderbook`, `/trades/ticks`.
- **실시간은 업비트 WebSocket(`wss://api.upbit.com/websocket/v1`) 중계**(Phase 25) — 현재가는 백엔드가 업비트 WS **1개만** 열어 모든 클라이언트에 fan-out하는 공유 허브(`main.py:TickerHub`, `/ws/tickers`), 코인 상세의 호가·체결은 종목별 on-demand 1연결(`/ws/market/{market}`). REST는 첫 화면(스냅샷·캐시)·집계용, WS는 실시간 갱신용으로 역할 분담. 인증 불필요는 동일.
- **분석 유니버스는 KRW 마켓 전체(~261종)** — `core/config.py`의 `USE_ALL_KRW_MARKETS`. 부팅 시 `/market/all`과 **교집합만** 사용 → 상장폐지 종목 자동 제외. (예: `KRW-MATIC`은 POL 마이그레이션으로 폐지 → `KRW-POL` 사용).
- **카테고리(섹터) 분류 = 업비트 데이터랩 '코인 분류' 스냅샷** (`app/data/upbit_sectors.json`). 업비트 시세 Open API는 카테고리를 안 주므로, 데이터랩(`datalab.upbit.com/sector?tab=marketMap`)의 Next.js RSC 페이로드를 **1회 스크랩**해 정적 파일로 보관. 261종 전체에 level1(대분류 5종: 스마트 컨트랙트 플랫폼·인프라·디파이·문화/엔터테인먼트·밈)/level2/level3 + marketCap. `config.MARKET_CATEGORIES`(market→level1)·`CATEGORY_LIST`(종목수 desc)·`MARKET_SUBCATEGORIES`로 노출. 스냅샷이라 신규 상장은 미분류(`None`), 분류 변경 시 재스크랩 필요. (스크랩 경위·후보 비교는 엔지니어링노트 §12)
- **카테고리 수익률은 실데이터** — **월별 히트맵**은 섹터 소속 종목의 **월봉 close 동일가중 평균**(`get_category_monthly`). **누적수익률 차트는 Phase 23부터 일봉**(`get_category_daily_cumulative`) — 섹터 소속 종목의 일봉 close를 윈도우 첫날=1.0으로 정규화해 동일가중 평균(=동일금액 매수·보유 지수)한 누적%, 전 종목 공통 윈도우(`min_len=150`)로 모든 섹터가 같은 날짜축, 공용 일봉캐시 재사용→팬아웃0. (월봉 누적은 월 단위 점이 12개뿐이라 호버가 끊겨 일봉화. 엔지니어링노트 참조) 상관관계 히트맵은 프론트가 월별값으로 계산. 더 이상 더미 아님 → "예시" 배지는 "업비트 분류" 출처 배지로 대체.

## 필드/포맷 규약

- `Ticker.change_rate` = Upbit `signed_change_rate`(부호 있음). `w52_high/low` = `highest/lowest_52_week_price`.
- **52주 신고가/신저가 판정**: `Ticker.is_52w_high/low` = 업비트 `highest/lowest_52_week_date`가 **오늘(KST)인지**(=오늘 경신). 과거엔 `현재가 ≥/≤ 52주가`로 판정했으나 정확히 일치하는 순간이 거의 없어 전수 0개였음 → 달성일 기준으로 변경(엔지니어링노트 §11). **마켓현황 배지(`W52Badges`)는 거래대금 상위 30종(`Market.W52_LIMIT`)으로 한정 노출** — 하락장에 유동성 낮은 잡코인 신저가가 수십 개 깔리는 노이즈 제거(메이저 경신만 신호로 취급, 트리맵 30과 통일). 판정 자체는 전 종목 계산.
- **카테고리 수익률 응답** `CategoryReturns` = `{ categories: [섹터명…], rows: [{ label, <섹터명>: 수익률%, … }] }`. (과거 고정 5필드 `CategoryMonthly`에서 동적 구조로 변경 — 섹터가 가변이므로). `/analysis/category/monthly`(최근 6개월 월봉, 히트맵용)·`/cumulative-daily`(최근 ~200일 **일봉** 동일가중 누적, rows에 `t`=unix초 포함, Sectors 누적차트). 과거 `/cumulative?period=월|분기|년`(월봉)은 Phase 23에서 일봉으로 대체됐고 **Phase 24에서 죽은 코드 체인(서비스 `get_category_cumulative`·`_PERIOD_SPEC`·`_period_key`·라우터·api·hook) 제거**.
- 캔들은 **오름차순(오래된→최신)** 으로 반환 (lightweight-charts 요구). Upbit는 최신순이라 뒤집음.
- `CandleItem.timestamp`=ms, `Trade.timestamp`=초(프론트가 ×1000), `EquityPoint.time`=초.
- 프론트 캔들 interval: `minutes/{1|3|5|15|30|60|240}` | `days` | `weeks` | `months`.
- **정렬**: `market_service.get_tickers()`는 **거래대금(`acc_trade_price_24h`) 내림차순**으로 반환(인기 종목 우선). 이를 그대로 따르는 코인목록(`/coins`)·비교분석(`/compare`)·스크리너(`/screener`)·대시보드 산점도가 동일 순서로 통일됨(`analysis_service.get_coin_stats()`도 `get_tickers()` 재사용). 코인목록 초기 정렬 헤더도 거래대금 desc(↓ 표시). **마켓현황(`/market`)은 자체 정렬**(상승률/하락률/거래대금 상위 등)이라 예외.
- **금액 표기(거래대금·가격)**: 전체 원화 + **천단위 콤마 + 작은 회색 "KRW" 접미사**(B안, 2026-05-28 사용자 선택). 적용처: 대시보드 24h 총거래대금 KPI(`fmtKrw`+`text-xl`)·마켓현황 상단 카드 가격(`MiniCard`)·거래대금 상위 표(`VolumeTable`). 후보였던 "백만 단위(업비트 실제 방식)"·"조/억 한글"은 미채택 — "전체 표기로 있어보이게" 우선(엔지니어링노트 §17). **예외: 코인목록 표의 거래대금 컬럼은 `억` 단위(`fmtVolume`) 유지**(261행 밀도상 전체 콤마는 가독성 저하).

## 성능/관측성 (직접 구현, 외부 의존성 없음)

- **캐시** `core/cache.py`: 인메모리 TTL + **stale-while-revalidate + single-flight** + **LRU 상한**(`_MAX_KEYS`, Phase 28 — 사용자 파라미터로 생성되는 키(포트폴리오 종목 조합 등)가 무한 증가하지 않게 초과 시 가장 오래전 갱신 키부터 축출. 읽기 핫패스는 락-프리 유지, 쓰기 시에만 `_store_lock`으로 축출). 만료돼도 옛 값 즉시 반환, 갱신은 백그라운드 1스레드. **일봉·월봉·주봉은 종목별 canonical(일봉 200·월봉 61·주봉 200) 1회 fetch 후 슬라이스 공유**(상관관계 ~1800ms→~5ms). ⚠️ **Phase 30 — 월봉/주봉도 일봉처럼 `TTL_CANDLE_LONG=1800`+canonical로 통일**: 과거엔 분/주/월이 `TTL_CANDLE=30s`였는데, 이를 소비하는 집계(기간수익률 300·섹터 월봉 1800)가 재검증될 때마다 261종 월봉을 콜드로 다시 받는 숨은 팬아웃이 있었음. 분봉(인트라데이)만 `TTL_CANDLE=30s`로 짧게(라이브 차트, WS가 최신가 덧씌움). TTL은 config(코인통계 `TTL_COIN_STATS=300` — 일봉 파생이라 거의 안 변하는데 261종 루프가 비싸 길게). 유니버스 전체 확장에 따라 일봉/스파크라인 TTL은 장기화해 팬아웃 부하 억제. **스파크라인(1시간봉)은 대시보드 시세표·마켓 상단 카드만 쓰는 시각 요소라 거래대금 상위 30종만 채운다**(`market_service._SPARK_LIMIT`, Phase 24 — 261종 전부 받던 팬아웃 제거).
- **레이트리밋(업비트 방향) + 포그라운드 우선(Phase 32)**: `clients/upbit_rest.py`에 전역 스로틀(~초당 8회) + 429 백오프 재시도. ⚠️ 백그라운드 워밍/SWR 재검증이 261종 팬아웃을 동시에 쏟으면 사용자(포그라운드) 요청이 그 줄 뒤에서 수십 초 대기하던 문제 → **백그라운드 호출(스레드명 `cache-revalidate`/`periodic-warm`)은 `_bg_lock`으로 직렬화 + 포그라운드 대기 시 양보**, 포그라운드는 `_bg_lock`을 건너뛰어 다음 슬롯(~0.12s)만 대기. 전체 8회/초 상한은 슬롯 예약이 보장.
- **캐시 LRU 읽기-터치(Phase 32)**: 과거엔 읽기가 LRU 순서를 갱신 안 해 '자주 읽기만 하는' 일봉 canonical 키가 새 키에 밀려 축출 → 다음 집계가 콜드 재팬아웃됐음. 이제 **읽기 적중도 꼬리로 이동**(`_touch`, 짧은 락) + 상한 `_MAX_KEYS=20000`. **callable TTL**(외부 소스 성공은 길게·**에러는 60초만** 캐시 → 죽은 소스에 매 진입 재-매달림 방지).
- **TTL 재조정(Phase 32)**: 일봉 `TTL_CANDLE_DAYS=3600`(하루 1회 확정, 장중엔 WS가 라이브), **60·240분봉 `TTL_CANDLE_INTRADAY=300`**(시간 단위 갱신 — 과거 30s라 인트라데이 지수 재계산마다 콜드 재팬아웃), **스파크라인(1시간봉) `TTL_SPARKLINE=1800` + 전 종목 프리페치**(`_SPARK_LIMIT` 제거 — 코인목록 전 행 미니 스파크라인용). 분봉(1~30분)만 `TTL_CANDLE=30s`(라이브).
- **주기 재워밍(Phase 32)**: `main.py:_periodic_warm` 데몬이 **240초를 7그룹으로 나눠 staggered** 재워밍(한꺼번에 안 몰리게) — 무거운 집계를 만료 직전 갱신해 신선도·LRU 유지(포그라운드 우선과 합쳐 사용자 안 막음). dev `SKIP_PREFETCH=1`이면 워머도 안 돔.
- **성능 원칙 (중요)**: 클라우드/멀티 인스턴스 전제 — **대량 팬아웃(수백 콜)은 서버 기동 시 1회만** 하고, 이후엔 어떤 클라이언트가 접속하든 캐시 히트로 빨라야 한다. 클라이언트가 매 요청마다 수십~수백 콜을 떠안으면 안 됨. (새 무거운 집계를 추가하면 **프리페치 워밍 범위도 반드시 함께 갱신** — 안 그러면 첫 방문자가 콜드 비용을 떠안음)
- **부팅 프리페치(동기 워밍)**: `main.py` lifespan이 `_prefetch()`를 **동기로 워밍한 뒤 기동**(`await asyncio.to_thread(_prefetch)`). 워밍 대상: `get_tickers()`(현재가+거래대금 상위 30종 스파크라인) + `get_coin_stats()`(변동성·수익률, 일봉 팬아웃) + `get_category_monthly()`(섹터 월봉 261종 팬아웃, 콜드 ~1분, 히트맵용) + `get_category_daily_cumulative()`(일봉 누적, 공용 캐시 재사용→팬아웃0) + **퀀트 9종**(network·pca·clusters·dendrogram·momentum·pairs·regime·portfolio·garch — 일봉 캐시 재사용이라 계산만) + **트렌드 3종**(`get_indices`=일봉+**60분봉 인트라데이 팬아웃**·`get_asset_indices`·`get_period_returns`=외부 CoinGecko 1회). 기동이 느려지는(스로틀 초당 8회 + 60분봉 추가 팬아웃) 대신 첫 사용자도 콜드 없이 즉시 응답. (체결강도는 WS 1회라 프리페치 제외 → 첫 호출 시 ~2초.) 대시보드·마켓·코인목록·카테고리·정량분석 전반을 커버. 종목별 호가·체결·캔들(10 interval)·상관관계는 호출 수(수천)·실시간성(짧은 TTL) 때문에 프리페치 제외 → 해당 종목 첫 방문 시 fetch.
- **통합 로깅**: `core/logging.py`의 `contextvars` 기반 요청 ID(rid)를 3계층 로그에 주입 — axios 인터셉터(프론트) / FastAPI 미들웨어(인바운드) / httpx `event_hook`(Upbit). 백엔드가 `X-Request-Id` 헤더로 전파. 같은 rid로 한 요청 전 구간 추적(Spring MDC 유사). 백그라운드 작업은 rid=`-`.
- **실시간 시세 중계 허브(Phase 25)**: `main.py:TickerHub`가 업비트 ticker WS **1개**를 유지하며 구독 클라이언트 전체에 fan-out한다(클라이언트마다 업비트 연결을 새로 열면 다중 탭/인스턴스에서 N개로 늘어 비효율 — 캐시 팬아웃 원칙의 WS판). 신규 클라이언트엔 `latest` 스냅샷을 즉시 푸시해 REST를 안 기다리고 화면이 채워지고, 구독자가 0이 되면 업비트 WS를 끊는다(끊기면 자동 재연결). 프론트는 **외부 store**(`contexts/realtimeStore.js`)에 시세를 모아 `useSyncExternalStore`로 **종목별 selector** 구독 — 한 종목이 바뀌어도 그 종목 셀만 리렌더(전체 Context 구독의 리렌더 폭주 회피). WS 메시지는 300ms 배치로 store에 반영(`RealtimeProvider`). 코인 상세 호가·체결은 종목별 WS(`hooks/useMarketStream.js`)라 허브 불필요. **WS 인증(Phase 31~32)**: 브라우저가 WS 핸드셰이크에 쿠키를 항상 보내지 않아, 프론트는 쿠키 인증된 REST로 받은 **단기 ws 티켓**(`/api/auth/ws-ticket`, type=ws, 60초)을 `?token=`으로 붙인다(`realtimeStore`/`useMarketStream`).
- **'/' 전 요소 실시간화(Phase 32)**: 실시간 의미 있는 것은 모두 라이브 — `useLiveTickers`(REST tickers에 WS 시세 덮어쓴 배열, store 전역 버전으로 리스트 재정렬·필터 카운트·거래대금 갱신), 코인상세 **52주 위치·1개월 수익률(한달전가 역산)·시장 점유율·거래대금 순위**는 현재가/거래대금 종속이라 라이브 계산, **캔들차트 실시간 슬라이딩**(WS 틱→형성 봉 갱신, 새 시간버킷이면 우측 새 봉 생성·좌측 밀림, `bucketSeconds`). 실시간 의미 없는 것(30일 변동성·GARCH·VaR·BTC 베타·상관관계 — 일봉 파생)만 정적. react-query **keepPreviousData**(코인/인터벌 전환 시 옛 화면 유지)·**gcTime 1h**(재방문 즉시)·**staleTime 5분**.

## 보안/인증 (Phase 31)

- **방식**: FastAPI **OAuth2 Password 플로우 + JWT(HS256, PyJWT) + bcrypt**(`core/security.py`). 하드코딩 단일 계정(`test/test`, 과제용 — env `AUTH_USERNAME`/`AUTH_PASSWORD`). access(30분)+refresh(7일).
- **토큰 보관**: **HttpOnly·Secure·SameSite=Strict 쿠키**(localStorage 미사용 → XSS로 토큰 탈취 불가). `cookie_secure`는 배포(HTTPS) True/로컬 False. CORS `allow_credentials=True`(이때 오리진 `*` 불가 → env로 명시).
- **가드**: 전 데이터 라우터에 `Depends(current_user)` 일괄(`main.py` `_AUTH`), `/health`·`/api/auth/*`만 예외. **WS도 인증**(ws 티켓 또는 쿠키). 미인증 시 프론트 `RequireAuth`가 `/login`으로(원래 경로 보존), `/login` 진입 시엔 무조건 세션 wipe.
- **레이트리밋/하드닝**(`core/ratelimit.py`): 전역 인바운드 IP 토큰버킷(`rate_limit_per_min`, 429) + 로그인 brute-force 잠금(`login_max_attempts`/`login_window_sec`/`login_lock_sec`) → 봇/해킹 요청 폭주로 AWS 비용 새는 것 1차 차단. **보안 헤더**(nosniff·X-Frame-Options DENY·Referrer-Policy·HTTPS면 HSTS). ⚠️ 앱 레벨 레이트리밋은 단일 인스턴스 backstop — **진짜 DDoS 방어선은 엣지(CloudFront/WAF/ALB)**, 분산 환경은 Redis 필요(보류).
- **401 처리(프론트)**: axios `withCredentials`+인터셉터가 401 시 `/api/auth/refresh` 1회 시도→실패하면 `/login`. WS는 ws 티켓.

## UI 컨벤션

- **색상(업비트 톤, Phase 15)**: 상승/매수/양(+) = 빨강, 하락/매도/음(−) = 파랑 (한국 거래소 관행, **의미색은 고정·불변**). **액센트 = 업비트 블루** — `brand-500 #1763b6`(버튼·활성탭·포커스·스피너·선택강조 등 크롬 전부), 헤더 네이비 `brand-700 #093687`. **과거 indigo(보라빛) 액센트를 전 페이지 교체**. 색 토큰은 `index.css`의 `@theme`(`--color-brand-*`)로 정의 → `bg-brand-500`·`text-brand-600` 등으로 사용. **페이지 배경 옅은 쿨 그레이블루 `#e6eaf2`**(Phase 23, 과거 `bg-gray-50`/`#f4f5f7`보다 어둡게 — 흰 카드 분리감↑. body(index.css)+Layout 둘 다)에 흰 카드, 카드 라운드 `rounded-md`(과거 `rounded-lg`에서 완화). 본문 폰트 **Pretendard**(`index.css` CDN import).
- **구분용 색 팔레트**: 방향 없는 시리즈/섹터 구분색은 `src/theme.js`의 `SERIES`(7색)·`DOM_COLORS`(지배력 도넛)로 **한 곳에서** 관리. Sectors(`CAT_PALETTE = SERIES`)·Dashboard(`DOM_COLORS`)·Compare(`COLORS`)가 import. (과거 컴포넌트마다 흩어져 튀던 indigo/emerald/violet 정리.) **팔레트는 밝은 톤으로 조정**(Phase 16, 사용자 "너무 어둡다"): 블루 `#4c8dd6`·teal `#27b3ab`·amber `#e0913c`·violet `#9b7fc7`·slate `#7d93a8`·rose `#d56e83`·green `#4cae76`. `DOM_COLORS`는 **단일 블루 농담이 아니라 hue 분리**(블루·teal·amber·violet + 기타 회색 `#d1d5db`) — 도넛 5조각이 다 파래서 구분 안 된다는 피드백 반영. ⚠️ 의미색(상승 빨강 `#ef4444`/하락 파랑 `#3b82f6`)과 안 헷갈리게 순수 red/blue는 제외. (CoinDetail 지표 토글 MA/Bollinger/RSI 색은 차트 오버레이와 묶여 있어 미변경.)
- **로고/헤더**: 로고는 **흰색 기울임꼴 워드마크 `UPquant`**(별도 아이콘 마크 없음 — 사용자가 "업비트엔 그런 거 없다"고 명시). `font-black italic tracking-wide`(사용자 "더 굵게" 요청, Phase 16). 동그란 "UP" 아이콘은 **favicon/앱 아이콘에만**(파란 원 + 흰 기울임 UP, 파일은 `public/favicon.png` — Phase 16에 `favicon.svg`→PNG 교체, `index.html`이 PNG 참조). 헤더 탭 글씨 볼드(비활성 `font-semibold`·활성 `font-bold`).
- **공용 UI 컴포넌트**(`src/components/ui/`): `Spinner`·`Card`/`CardHeader`·`StatCard`. 카드 스타일·간격·제목을 한 곳에서 통일하려는 토대. (Card/StatCard는 생성만 해뒀고 기존 KpiCard/MetricCard는 이미 톤이 맞아 미적용 — 필요 시 교체.) `PageHeader`는 본문 중복 제목을 헤더 탭으로 일원화하며 전 페이지에서 미사용이 돼 **Phase 24에서 삭제**.
- **커서**: 클릭 가능 요소(`button`/`select`/onClick 행)에만 `cursor-pointer`, disabled엔 `disabled:cursor-not-allowed`. **일반 텍스트엔 `cursor-default`를 넣지 말 것**(브라우저 기본값에 위임, I-beam 신호 보존). 앵커는 기본 pointer라 생략.
- 라우트(**Phase 34 기준 — `/그룹/페이지` 일관화**): 로고(`/`)=**코인 목록**(master-detail, `/coins`·`/coins/:market`). **시장 동향**=`/trends`(업비트 코인동향 미러, 헤더 단일 링크 — 옛 `/dashboard`·`/overview` 리다이렉트). **마켓 그룹** `/market/{overview,sectors,screener}` = `Explore` 단일 페이지의 경로 서브탭 + `/market/compare`(종목 비교, 독립 ComparePage — Phase 34에서 리서치→마켓 이동: 발굴한 후보를 겹쳐 보는 '탐색' 성격). **리서치 그룹** `/research/{structure,regime,factor,risk}` = `Analysis` 한 컴포넌트(경로별 Body가 그룹 훅 게이트). **전략 그룹** `/strategy/portfolio`(최적화) · `/strategy/backtest/:strategy`(`ma`·`rsi`·`tsmom`·`portfolio` — **전략별 하위 라우트**, `key` 리마운트로 상태 초기화) · `/strategy/validation`(**검증 3기법을 한 페이지에 모음** — Phase 34에서 드롭다운 해제, `/strategy/validation/:method`는 리다이렉트). **페이지 내부 전략탭 없음 — 헤더 드롭다운(백테스트)이 곧 선택자.** 옛/평탄 경로(`/dashboard`·`/overview`·`/market`·`/sectors`·`/screener`·`/structure`·`/regime`·`/factor`·`/risk`·`/tools/*`·`/compare`·`/backtest`·`/analysis/*`·`/quant`)는 전부 리다이렉트. 라우트 이동 시 `App.tsx`의 `ScrollToTop`이 스크롤을 최상단으로 초기화. `/help`·`/guide`만 `window.open` 별도 창(중앙정렬 `utils/popup.ts`). **헤더(`sticky top-0 z-50`, 한글 라벨)**: 로고(→코인목록) · **시장 동향**(단일) · **마켓▾**(시장 현황·섹터·스크리너·종목 비교) · **리서치▾**(시장 구조·시장 국면·팩터·리스크) │**관점 구분선(Phase 35)**│ **최적화**(단일) · **백테스트▾**(MA 크로스·RSI·추세추종·포트폴리오 보유) · **검증**(단일) │ **AI 전략**(βeta=그리스 β+eta 이탤릭 뱃지, 모달 트리거 — 검증 옆 구분선 우측). **구분선은 분석(시장동향·마켓·리서치)│실행(최적화·백테스트·검증) 단일 경계 1개**(관점 표기, Phase 35). 활성 탭은 **흰 글씨·볼드만**(밑줄 제거, Phase 35), 드롭다운 화살표는 라벨 오른쪽 absolute(라벨만 중앙정렬). 드롭다운은 호버(`NavGroup`, 메뉴 위 투명 브릿지; ⚠️우측 더보기는 컨테이너 `h-full`이라야 `top-full`이 헤더 아래에서 열림 — Phase 34). 우측은 🔔가격알림·🌙다크모드·**더보기(텍스트+chevron)**(⋯ 아이콘→"더보기" 텍스트, Phase 35 — 가이드·도움말·시스템·실시간상태·로그아웃). ⚠️ **원칙: 페이지 내 탭/토글로 콘텐츠를 숨기지 않는다**(드롭다운=내비 한정; 백테스트 전략은 Phase 33에서 드롭다운으로 분리돼 인페이지 탭 제거). (헤더 진화: …→자산운용 톤 재명명·전략 분리(30)→`/그룹/페이지` 일관화·시황→시장동향·백테스트/검증 드롭다운 분리(33)→**검증 드롭다운 해제·단일 페이지(34)**. 엔지니어링노트 §22·§30·§44·§45.)
- **로딩/에러 게이트(Phase 30)**: 표시형 페이지(시황·마켓·섹터·스크리너·리서치)는 **그 페이지가 쓰는 모든 데이터 훅을 한 곳에서 모아** 하나라도 로딩이면 헤더·푸터만 남기고 전체를 `PageLoading`, 하드에러면 `PageError`로(다른 컴포넌트 일절 비노출). react-query 디둡 덕에 자식이 같은 훅을 또 불러도 네트워크는 1회. `Analysis`는 경로별 Body가 활성 그룹 훅만 모아 게이트(다른 그룹 over-fetch 없음). **상호작용형(종목 선택·인터벌·전략 토글)**과 master-detail 상세는 초기 데이터만 게이트하고 이후 인플레이스 로딩(컨트롤을 가리지 않음).
- **공통 푸터(Phase 23)**: `components/layout/Footer.jsx`, 전 페이지(Layout). 흰 배경은 **헤더처럼 뷰포트 full-bleed**, 내부 요소는 `max-w-[1440px]` 중앙정렬, 화면 맨 아래까지(Layout `flex flex-col`+main `flex-1`). 좌측 브랜드(logo.png를 CSS `mask`로 네이비 #093687)+데이터출처 / 네비 3컬럼(둘러보기·정량분석·전략도구) / 안내(도움말·가이드·Open API) / 하단 면책·저작권. 가짜 사업자정보 없음.
- **대시보드 = 업비트 "코인동향"(`/trends`) 미러 (Phase 29 전면 재편)**: 분석 게이지(공포탐욕·지배력 도넛·breadth·regime focal)는 마켓/분석으로 보내고, 대시보드는 **발견·지수 중심**으로. 구성(세로 스크롤, 탭 숨김 없음): ⑴**자체 시장 지수 6카드**(종합·알트·BTC그룹·ETH그룹·상위10·상위30, 동일가중) + **당일/전일 인트라데이 라인차트**(60분봉 자체 산출) + 우측 **주간 상승 TOP10** 레일 ⑵**오늘의 환율**(외부 FX) ⑶**시황 한 줄**(자체 생성) ⑷**랭킹 그리드**(급상승·급하락·거래량급증·**체결강도 매수/매도**) ⑸**최신 뉴스**(외부 RSS, 페이지네이션) ⑹**디지털 자산 표**(기간별 상승률 1주~1년 / **시가총액** 탭) ⑺**디지털 자산 지수 표**(시장/전략/테마/섹터 탭 + 개요 + 전일·1개월·3개월, 자체 동일가중). 공식 UBMI 수치는 비공개라 자체 동일가중으로 대체. (PDF는 `references/코인동향 _ 업비트(Upbit).pdf`. 의사결정 §44.) **마켓 = 시장 요약 스트립(KPI·공포탐욕·상승하락 — 대시보드에서 이관) + 순위·트리맵·52주·A-D·산점도.**
- **(구) 페이지 역할 분담(Phase 16, 일부 폐기)**: **대시보드 = 시세 표(메인) + 인사이트 위젯 + 드릴다운 진입점**. 3블록 — ⑴KPI 4 ⑵**2-컬럼: 왼쪽(2/3) 시세 표**(거래대금 상위 16종 — 순위·코인·현재가·24h·1일 스파크라인, 행클릭→상세) + **오른쪽(1/3) 위젯 스택**(공포탐욕 게이지·시장 지배력 도넛·급등급락) ⑶**하단 2-컬럼**(이번 달 섹터 성과→`/sectors` / 52주 신고·신저 요약→`/market`). 깊은 분석(카테고리 3종·산점도)은 섹터분석으로 보내고, 메인은 **빽빽한 시세 표를 중심 데이터 덩어리로** 둬 세로를 채우고 시장 전체를 보여준다(진짜 크립토 대시보드 정석). 전부 프리페치된 tickers·월봉 기반이라 콜드 0. (한때 "비트코인 단독 추세 히어로"를 뒀으나 "한 코인만 대표하는 게 어색·여전히 휑함" 피드백으로 시세 표로 교체 — 엔지니어링노트 §22.) **섹터 분석(`/sectors`, 신설) = top-down 인사이트**(카테고리 누적·월별·상관 + 리스크-수익 분포) — 과거 대시보드에 다 몰려 무겁던 카테고리 3종+산점도를 이리로 이동. **마켓 현황 = 순위·트리맵·52주**. 급등급락(대시보드 요약) ↔ 상승/하락 상위(마켓 전체 순위)는 "한눈 요약 ↔ 자세히" 관계.

## 작업 규칙

- 사용자와 **한국어**로 소통.
- **커밋은 맡기면 직접 수행해도 된다**(2026-06-09 변경). 단 ⑴메시지는 **한 줄**(한글 conventional: `feat:`/`fix:`/`refactor:`/`chore:`/`docs:`/`test:`, 여러 항목은 `·`로 나열), ⑵**Claude/Co-Authored-By를 절대 명시하지 말 것**(사용자가 직접 작성한 것처럼), ⑶**도메인별로 파일을 묶어** 여러 커밋으로 나눌 것, ⑷**커밋 메시지에 "Phase N" 같은 내부 작업이력 라벨을 넣지 말 것**(Phase 번호는 본 문서 "작업 이력" 전용 — 커밋엔 *무엇을 바꿨는지*만, git log가 곧 단계 기록). `push`는 사용자가 따로 지시할 때만.
- **`.gitignore`: `*.md`는 기본 무시(로컬 메모용)**. 추적되는 마크다운은 `README.md`, `CLAUDE.md`, `references/*.md`뿐. `references/QAE_EDA_*`(원본 기획서 .docx/.pdf)는 의도적으로 제외(로컬 보관). 새 .md를 git에 올리려면 예외 규칙 추가 필요.
- 문서 역할: 개요/구조/스크린샷 **+ 사실·동작 정보(예: 캐시 TTL·동작 방식, 데이터 흐름)** → `README.md`(**정보 전달 목적 문서**), API 명세 → `references/API.md`, 계획서 → `references/프로젝트계획서.md`, 기술 의사결정 기록(**포트폴리오/회고용**, 고민·후보·선택) → `references/엔지니어링노트.md`, **작업 이력·진행 상태·세션 인계 → 본 문서 하단**, 페이지 IA·중복 진단·아이디어 비축·P0~P3 진행 → `pages.md`(루트, `.gitignore`에 예외로 추적됨).
  - ⚠️ **엔지니어링노트는 "정보 정리처"가 아니다**(2026-05-28 사용자 명시). 사실·수치·동작 방식 같은 **정보(예: 캐싱 동작·TTL 표)는 `README.md`** 에 적고, 엔지니어링노트엔 **성장에 도움 될 고민·후보 비교·전략 방향성(회고/포트폴리오)** 만 남긴다. "정보를 어디 적지?" → 의사결정 과정/판단이면 엔지니어링노트, 사실/동작 설명이면 README.
- **작업 후 문서 갱신 (필수)**: 코드를 바꾸면 **같은 작업 안에서** 관련 문서를 함께 갱신한다. (갱신 대상이던 `HANDOFF.md`·`docs/HISTORY.md`는 본 문서로 통합·삭제됨 — 더 이상 만들지 말 것.) 변경 유형 → 갱신할 문서:
  - 기능·화면·완료항목·로드맵 변경 → `README.md`
  - API 엔드포인트·쿼리 파라미터·응답 스키마 변경 → `references/API.md`
  - 계획·범위·적용 상태 변경 → `references/프로젝트계획서.md`
  - 규칙·구조·데이터소스·성능·UI 컨벤션 변경 → 본 문서(`CLAUDE.md`)의 해당 섹션
  - 의미 있는 작업 단위 완료 → 본 문서 하단 **작업 이력**에 `Phase N` 추가 + **현재 상태 & 다음 작업** 갱신 (+ 페이지 구성 바뀌면 `pages.md` 트리/로드맵도 함께 갱신)
  - 진행 상태가 바뀌면 메모리 `project_upquant.md`도 최신화 (레포 밖, 세션 컨텍스트 복원용)
  - **기술적 의사결정 → `references/엔지니어링노트.md`에 의사결정 형식(문제상황 → 후보/방법들 → 고민 → 선택 → 근거)으로 추가.** ⚠️ **사소한 판단이라도, 사용자와의 대화에서 얻을 수 있는 내용이면 꾸준히 기록**한다(이전의 "영양가 있는 것만" 기준을 완화 — 사용자 명시 요구 2026-05-26). 막다른 길·검증 과정·"지금 안 한 것"도 포함. 포트폴리오/회고용.
  - **사용자가 대화 중 새로 제시한 규칙·원칙·요구사항(예: 성능 원칙, 문서화 규칙)은 본 `CLAUDE.md`의 해당 섹션에도 매번 반영**한다(2026-05-26 사용자 명시). 일회성 작업 지시가 아니라 앞으로도 지켜야 할 원칙이면 규칙으로 박아둔다.

## 현재 상태 & 다음 작업

**완료(요약)** — 상세는 README "현재 상태 & 로드맵" 참조.
- 업비트 시세 REST 실연동(현재가·캔들·호가·체결·마켓목록·52주), 8개 페이지 + 데이터 페칭 훅.
- 인메모리 캐시(SWR·single-flight)·부팅 프리페치·스로틀·429 재시도, rid 3계층 통합 로깅.
- 변동성·1개월수익률·상관관계(실 캔들), MA크로스/RSI 백테스트.
- 분석 유니버스 KRW 전체(~261종) 확장, 리스크-수익 산점도·마켓 트리맵·코인목록 스파크라인 개편.
- 거래대금 기준 정렬 통일(코인목록·비교·스크리너·대시보드 산점도) — Phase 11.
- **카테고리(섹터) 분류 실데이터화** — 업비트 데이터랩 분류 스크랩(261종 5섹터) + 월봉 동일가중 수익률 + 부팅 워밍 — Phase 13.
- **사용자 요청 UI 정리 묶음(2026-05-28)** — 대시보드(업비트분류 배지 제거·시장지배력 간격·상관관계 줄바꿈+좌측열 폭 통일·공포탐욕 라벨·총거래대금 B안 표기), 마켓(52주 배지 상위30 한정·상단카드/거래대금 B안 표기·트리맵 폰트 스케일), 코인목록(중복 요약카드 제거), **부가기능 헤더 탭 복귀(+디폴트 결과·`?` 툴팁), 도움말 정리** — Phase 14. (도움말·대시보드 Edge 스크린샷 육안 확인)
- **UI 업비트 톤 대개편 + 콘텐츠 재배치(2026-05-29)** — 액센트 indigo(보라)→업비트 블루 전 페이지 교체, 페이지 배경 회색·라운드 완화·Pretendard 폰트, 로고(흰 기울임 워드마크·원형 제거)·favicon·헤더 탭 볼드, 구분색 팔레트 `theme.js`로 통일, 공용 컴포넌트(`components/ui/`)+PageHeader 전 페이지, 대시보드 순서 `누적→월별→상관`(원천→파생)·마켓 "시장 현황→거래대금 비중 지도"·주요종목 라벨 — Phase 15. (빌드 통과, 브라우저 육안 미검증)
- **IA 재편 + 대시보드 재설계 + 차트/색 디테일(2026-05-29)** — **섹터 분석 `/sectors` 신설**(대시보드의 카테고리 3종+산점도 이동), **대시보드를 시세 표(거래대금 상위 16) 중심 2-컬럼 + 인사이트 위젯 + 하단 섹터성과·52주로 재설계**(BTC 단독 히어로는 폐기), 헤더는 메인 4탭 + **"서비스 더보기" 드롭다운**(스크리너·비교·백테스트, 빨간점), 로고 굵게(`font-black`)·favicon PNG, 지배력/시리즈 팔레트 hue 분리·밝게, 누적수익률 세로 확대·natural 곡선·Y축 헤드룸 — Phase 16. (빌드·ESLint·py_compile 통과, 브라우저 육안 미검증)
- **빌드 복구 + 잡정리(2026-05-30 전반)** — Phase 17. ⑴Phase 16 잔여 깨짐 복구(Sectors.jsx의 useNavigate/useCoinStats/scatter 헬퍼 미import 정리, 섹터 안내 카드 추가) ⑵ESLint `set-state-in-effect` 5건 해결(loading을 `loadedKey !== currentKey` 파생값으로 — useTicker/useCandles/useCategoryCumulative/useCorrelation/Compare. effect에 cancelled cleanup 추가) ⑶PostCSS `@import must precede all other statements` 경고 해결(Pretendard `@import`를 `index.html` `<link>`로 이동 — Tailwind v4가 펼치며 밀려서 무시되던 실제 폰트 로드 실패도 함께 수정) ⑷마켓 순위 표 RANK_LIMIT 20→10 ⑸리스크-수익 산점도를 섹터→마켓현황으로 이식(`SCATTER_LIMIT=100` 신규 정의, 기존 미정의 참조 버그도 함께 해결) ⑹코인목록 master-detail 개편(`CoinDetailView({market})` named export로 분리, `CoinList`를 좌 col-9 상세 + 우 col-3 슬림 사이드바로 재작성, `/coins`·`/coins/:market` 단일 컴포넌트로 통합).
- **IA·인사이트 + 허세용 지표(2026-05-30 후반)** — Phase 18. ⑴백테스트에 **Sharpe·Sortino·Calmar** 리스크 조정 지표(일별 equity 수익률 √365 연율화, BacktestMetrics 스키마 확장) ⑵**분석 카트 도입** — `AnalysisCartContext`(localStorage) + 공용 `CartButton`(+/✓ 토글), 헤더 카운트 배지+드롭다운(담긴 종목·×해제·비교/백테스트 진입), 종목 행/카드 5곳(Dashboard 시세표·Market 순위3종·CoinList 사이드바·Screener 결과·Sectors 모달)에 + 버튼, Compare/Backtest 진입 시 카트 종목으로 초기값 자동 채움, Screener에 "결과 전체 카트 담기" ⑶Sectors **섹터 드릴다운 모달**(섹터 안내 카드를 button으로 → 모달에 소속 종목 표 + 평균 수익률·총 거래대금 헤더 + 카트 버튼·행 클릭 상세 이동·ESC/바깥 클릭 닫힘) ⑷Dashboard에 **Opportunity Feed**(최상단, 4-카드 시그널 — 52주 새 경신·급등(>+2%)·안정 상승 모멘텀(`return_1m/volatility` 비율 상위, Sharpe 풍 단순화)·섹터 로테이션(이번 달 vs 지난 달 ▲▼). 종목 칩에 카트 + 클릭 상세 통합 `StockChip` 헬퍼).

- **퀀트/ML 분석 묶음 + 퀀트 랩(2026-05-31)** — Phase 19. 외부 라이브러리(numpy/scipy/scikit-learn/statsmodels/arch/hmmlearn/networkx) 도입해 정량 분석 8종 신설: **Markowitz 효율적 경계선**(P1-2 흡수)·**상관 네트워크 MST**(P3-1 흡수)·**PCA 시장요인**·**K-means+계층 덴드로그램**(P3-2 흡수)·**GARCH 변동성예측+VaR**·**횡단면 모멘텀 팩터 백테스트**·**공적분 페어트레이딩**·**HMM 시장국면**. 신규 `services/quant_service.py`(공용 `returns_matrix` 헬퍼 + 8기능)·`schemas/quant.py`·`routers/quant.py`(`/api/quant/*` 9개). 부팅 프리페치에 9종 워밍 추가(콜드0). 프론트 `pages/QuantLab.jsx`(8 서브탭, d3-force 네트워크·SVG 덴드로그램)·`api/quant.js`·`hooks/useQuant.js`, 헤더에 **별도 "퀀트 랩" 탭**(/quant). (빌드·ESLint·py_compile 통과, 실데이터 산출 확인. 브라우저는 네트워크 탭 1건만 수정 검증)
- **P2 묶음: 탐색 통합 + 코인상세 강화 + 포트폴리오 백테스트(2026-05-31)** — Phase 20. ⑴**P2-1**: Market·Sectors·Screener를 `/explore` 단일 페이지의 URL기반 서브탭으로 통합(`pages/Explore.jsx`, 기존 본문 재사용), 헤더 `대시보드·탐색·코인목록`으로 단순화(스크리너→탐색). ⑵**P2-2**: 코인상세에 주요지표 카드(30일 변동성·1개월수익률·시장점유율·**GARCH 연변동성·1일 VaR**)+52주 위치 바. ⑶**P2-3**: 백테스트에 **포트폴리오 보유** 모드 — 백엔드 `/api/backtest/portfolio`(가중 보유+선택적 리밸런스+동일가중 벤치마크), 프론트 `PortfolioBacktest`(카트 종목·비중 입력·자산곡선 vs 벤치·기여도). (빌드·린트·py_compile 통과, 브라우저 육안 미검증)

- **IA 재편 + 라우트 정리 + 동선/가이드(2026-06-01)** — Phase 21. ⑴분석/도구 분리 리팩터 마감(헤더 드롭다운→평탄 탭, "팩터·전략"→"팩터 분석" 개명, 도구의 GARCH 탭 제거=코인상세 일원화) ⑵탐색의 묻힌 서브탭(마켓·섹터·스크리너)을 **헤더 탭으로 승격** + 의도별 그룹 구분선 ⑶**코인 목록을 메인('/')으로**(로고=코인목록), 대시보드는 `/dashboard`로, 코인목록 헤더 탭 제거 ⑷시장구조/팩터분석 라우트 `/analysis/*`→`/structure`·`/factor`(크로스링크 4곳 정정) ⑸C-⑨ 포트폴리오 동선(축소안): 최적화 ★/◆ 비중 카드에 `이 비중으로 백테스트 →`(Tools가 preset 보관→백테스트 포트폴리오 모드 자동) ⑹중복정리: 마켓 거래대금 표 제거·대시보드 W52Summary/MoversFeed 제거(오늘의 시그널 일원화)·시세표 전폭 ⑺시장구조/팩터분석 상단 "한눈 요약" 스트립 ⑻**별도 가이드 창 `/guide`**(방법론·기술스택 + 다이어그램 placeholder, 헤더 "가이드" 버튼).
- **상폐 404 + 리스크 탭 + 거래비용·생존편향 + 대시보드 관제탑 + IA 영어화(2026-06-02~03)** — Phase 22. 상폐 종목 404→500 전파 버그(valid_markets 교집합+404→[] 안전망), **리스크 탭 `/risk` 신설**(변동성 분포·VaR 랭킹, coinStats 재사용 호출0), 거래비용(`fee_bps` 5bps) 백테스트·모멘텀 반영, 단일전략 buy&hold 벤치마크+알파, 신뢰성 ⚠️Caveat 배지, 대시보드 관제탑 재구성(KPI4+시장종합추세 focal+오늘의시그널+보조4카드+시세표), 전략도구 "More" 드롭다운+독립 라우트(`/tools/*`), 헤더 라벨 영어화, 본문 PageHeader 제거.
- **헤더 한글화 + 차트 버그수정 + 섹터 누적 일봉화 + 로고/배경/공통 푸터(2026-06-03)** — Phase 23. 헤더 영어→한글 전문음차 환원, RSI 흰화면 크래시(v5 `getSeries`)·차트 로고·지표 토글 줌리셋 수정, 섹터 누적수익률 월봉→일봉(recharts 표준 Tooltip), 팩터/백테스트 경고 제거, 로고 점 제거, 배경 `#e6eaf2`, **공통 푸터 신설**(full-bleed 흰배경·logo mask). 상세는 작업 이력 Phase 23.
- **효율적 경계선 곡선 + 시장구조 2분리 + 신뢰성 경고 정비 + 성능/죽은코드 정리 + 분석 카트 제거 + 에러 바운더리 + 코인상세 보강(2026-06-06)** — Phase 24. 상세는 작업 이력 Phase 24.
- **실시간 WebSocket 시세 중계 + 백테스트 강화(전략 비교·워크포워드·BTC 벤치마크) + 통합 로딩 컴포넌트(2026-06-07)** — Phase 25. 상세는 작업 이력 Phase 25.
- **수익률/위험조정 레버 4종 + AI 리포트 + UX·운영 묶음 + 전면 TypeScript(2026-06-07)** — Phase 26. **신규 기능**: A-D(시장 폭) 라인·몬테카를로 백테스트·추세추종(TSMOM)·가격 알림(🔔 토스트)·다크모드·차트 PNG export·비교 공유 링크·시스템 모니터링(`/system` 자체 메트릭). **수익률 레버**: TSMOM 고도화(12-1 skip·국면/크래시 필터·변동성 타게팅·히스테리시스 → 하락장 MDD 35→12%)·Ledoit-Wolf 수축 공분산+리스크 패리티·Historical VaR/CVaR·유동성 슬리피지·다중검정 과최적화 p값. **AI 전략 리포트**(Gemini, 호출부 주석·종류별 차등 캐시). **엔지니어링**: requirements 정리·수치 pytest 9개·라우트 코드 스플리팅·CI·cache 재검증 메트릭·**전 프론트 `.tsx` 전환(tsc 그린)**·Backtest 파일 분리. (이미 구현돼 있던 것 발견: BTC베타·z-score·거래량급증·VWAP/Volume Profile.) 상세는 작업 이력 Phase 26.
- **운영 견고화: WS SSL 픽스 + 환경변수화 + 프론트 에러 UX + 테스트 확대(2026-06-09)** — Phase 27. macOS 프레임워크 Python의 깨진 CA 심링크로 업비트 `wss://`가 전부 실패하던 것을 certifi 컨텍스트 명시로 수정, 프론트 `VITE_API_BASE`/`WS_BASE`·백엔드 `CORS_ORIGINS`/`SKIP_PREFETCH` 환경변수화(하드코딩 제거), `/health` readiness, 조용한 fetch 실패→`useFetch`+`PageError` 재시도 UI(훅 error/retry + 페이지 7곳), pytest 9→20개. 상세는 작업 이력 Phase 27.
- **전수 코드 리뷰 후속: 캐시·정밀도·페어 사후검증(2026-06-09)** — Phase 28. coin_stats TTL 정상화·중복 페치 제거, 캐시 LRU 상한, RNG 시드 결정화, MA 익일 체결, 공적분 페어 사후검증(백테스트 곡선·승률). 상세는 작업 이력 Phase 28.
- **UI/UX 재정리 + 대시보드 코인동향 미러 전면 재편(2026-06-09)** — Phase 29. 헤더 4그룹 드롭다운+우측⋯, 대시보드를 업비트 코인동향(자체 시장지수·당일/전일 인트라데이·환율·뉴스·시황·랭킹·체결강도·기간수익/시총·자산지수)으로 전면 재작성, 마켓 요약 스트립. 외부 연동(환율 open.er-api·뉴스 한국RSS·시총 CoinGecko)·체결강도(WS)·인트라데이(60분봉) 실구현. 상세는 작업 이력 Phase 29.
- **코드리뷰 후속 개선 + react-query + 헤더 자산운용 톤 재명명 + 포트폴리오 페이지 완성 + 전역 로딩게이트 + 백테스트 2분리(2026-06-09)** — Phase 30. **백엔드**: 월봉/주봉 canonical 장기 TTL(숨은 팬아웃 제거)·페어 백테스트 β 룩어헤드 제거(형성/거래기간 OOS)·모멘텀 롱온리 토글·로그 이중출력 제거·`/ws/market` 입력검증·pytest 26. **프론트**: react-query 도입(동일키 디둡·캐시 재사용)·다크모드 차트 즉시반영·헤더 4그룹 자산운용 톤(시황·마켓·리서치·전략, 종목비교→리서치)·포트폴리오 페이지 확장(CAL·목표수익률 슬라이더·리스크기여도·상관행렬·자산표)·표시형 페이지 전역 로딩/에러 게이트·백테스트→[백테스트(전략실행)/검증·시뮬레이션] 2페이지 분리. WS 실시간 갱신 end-to-end 검증 통과. 상세는 작업 이력 Phase 30.
- **전수 리뷰(4관점) 후속: 퀀트 정확성·인증·실행연결·정직표기(2026-06-10)** — Phase 31. Q1 상관 수익률 기반·Q2 페어 FDR·Q3 페어 실제 2-leg PnL·Q5 RSI Wilder·Q6 변동성 타게팅 사이징·Q8 도미넌스 시총(CoinGecko /global)·Q9 실제 F&G(alternative.me)·Q10 체결강도 라벨. **OAuth2+JWT(HttpOnly 쿠키, WS는 ws-ticket) 로그인·전 라우터 가드·레이트리밋·보안헤더**. 시그널 집계 라우터+패널·CSV export, /system 외부소스 헬스, 통합 Caveat·rf=0·생존편향, 외부소스 에러 60s 캐시. pytest 26→43, 프론트 vitest 9 도입. 상세는 작업 이력 Phase 31.
- **성능(스로틀 우선·TTL·워머)·react-query·'/' 전면 실시간·로그인 재디자인(2026-06-10)** — Phase 32. 포그라운드 우선 스로틀·일봉 1h/60분봉 5분 TTL·스파크라인 전종목 프리페치·주기 워머 분산·LRU 읽기터치. react-query keepPreviousData·gcTime 1h·staleTime 5분. '/' 전 요소 실시간화(거래대금·재정렬·필터카운트·52주위치·1개월수익·점유율·순위·캔들 슬라이딩)+WS 인증 티켓. 경량 SVG 스파크라인·시그널 배지·최근 본 코인 왼쪽 플로팅. 로그인 plain 재디자인(큰 로고 인트로·언더라인 인라인 폼·비번 눈토글). 상세는 작업 이력 Phase 32.
- **라우트 IA 일관화 + AI 리포트 Gemini 실연동 + 시황/최적화 레이아웃 + 가이드 실캡처 + 헤더/팝업 + TS strict 전면(2026-06-11)** — Phase 33. 라우트 `/그룹/페이지`(마켓·리서치·전략) + 시황→**시장 동향(`/trends`)**, 백테스트·검증 드롭다운 IA(내부 탭 제거·전략별 하위 라우트), **AI 리포트 Gemini 실연동**(부문별 프롬프트·stub 제거·실패 시 502·실제 PDF), 시황 레이아웃(시황·뉴스 상단), 최적화 레이아웃(상관행렬↑·통계 폭↓), **가이드 실 스크린샷 8개**(Playwright), 헤더 드롭다운 호버영역 확대·팝업 중앙정렬, **TS strict 전면 활성화 + 도메인 모델 실타입화**(types.ts·api/hooks·props, any 449→226). 상세는 작업 이력 Phase 33.
- **브라우저 검증 후속 UI/버그 묶음 + 체결강도 hang 수정(2026-06-11)** — Phase 34. **체결강도 무한 행(hang) 버그** 수정(WS 수집 4초 deadline — 종료조건이 '전종목 수집'뿐이라 영영 안 끝나던 것), 시장 동향 2-컬럼 재배치(좌: 지수·환율·시그널 / 우 레일: TOP10+랭킹 세로), 라우트 이동 `ScrollToTop`, **검증 단일 페이지 통합**(드롭다운 해제)+**일괄 단일 로딩 게이트**(분할 스피너 제거), 최적화 상관행렬 확대·높이 정렬, 백테스트 버튼 '실행' 통일, AI 리포트 단일 스피너+**thinking_budget=0으로 짤림 해결**, PDF 4면 여백, 더보기 드롭다운 헤더 침범 수정, 최근 본 코인 패널 본문 거터 정렬+ellipsis, **종목 비교 리서치→마켓 이동(`/market/compare`)**, 드롭다운 페이지 브레드크럼. 상세는 작업 이력 Phase 34.
- **브라우저 검증 2차: 시장 동향 정밀화 + 환율 추이차트 + 헤더 관점구분선/AI 전략 + 외부소스 보강(2026-06-11)** — Phase 35. **환율 추이 라인차트**(frankfurter.dev 시계열·통화별 X/Y축 차트·보라색), **뉴스 소스 교체**(폐기된 코인데스크코리아→블록체인투데이·HTML 가드), 시장지수 그래프 가로꽉·툴팁, 우측 레일 `justify-between` 균등분배(좌측 바닥 정렬), 시그널 고정 12칸+회색 채움, 체결강도 프리페치, 리서치 정렬 정리(모멘텀/국면 가운데·표 table-fixed·팩터 중복요약 제거), 헤더 분석│실행 구분선·**AI 전략 βeta 텍스트**(검증 옆)·더보기 텍스트·활성탭 밑줄 제거, 푸터 IA 정합, **AI 리포트 503 재시도**(2.0 폴백은 무료티어 429라 제거). 상세는 작업 이력 Phase 35.

**다음 작업 (우선순위 순)**
1. **배포(AWS)** — S3(정적)+EC2(FastAPI)+CloudFront(도메인·HTTPS). env 주입 필수: `AUTH_SECRET`(강한 랜덤)·`COOKIE_SECURE=1`·`CORS_ORIGINS`·**`GEMINI_API_KEY`**(`backend/.env`는 .gitignore라 배포 시 별도 주입). EC2는 과학 스택 메모리상 **t3.small(2GB) 권장**(프리티어 1GB는 스왑 2GB 동반). **CloudFront 단일 오리진**(S3 기본 + `/api`·`/ws`→EC2)으로 쿠키 Secure·CORS 일원화 + ACM(us-east-1)·Route53. 앱 레벨 레이트리밋은 backstop, 진짜 방어선은 엣지(WAF). 인증 계정은 하드코딩 `test/test`(과제용).
2. **TS strict 잔여 `any` 정밀화 (선택)** — 도메인 모델·데이터 계약·컴포넌트 props는 실타입 완료(`any` 449→226). 남은 ~226은 **라이브러리 경계**(recharts ValueType·lightweight-charts ref)·**스키마 없는 클라 형태**(SystemMonitor `data`·PriceAlerts alert)라 `any`가 관용적. 더 좁히면 라이브러리 타입 결합·정밀도 손실 등 한계효용 낮음(엔지니어링노트). 할 만한 건 backtest `params`·Alert/Toast·chart-ref 정도.

**검증 메모(Phase 35 시점)**: 자동 검증은 전부 그린 — 프론트 `tsc(strict)`·`eslint`·`vite build`, 백엔드 `compileall`·`pytest 43`. 외부소스(frankfurter 환율 시계열 32일·블록체인투데이 뉴스 50개·체결강도 deadline 262종·Gemini 2.5-flash 2초)는 격리 호출로 실데이터 확인. **브라우저 UI 육안은 사용자**(환율 차트·뉴스·체결강도·레일 균등분배·헤더 구분선/AI 전략). **체결강도·환율·뉴스·AI 리포트는 백엔드 재시작**해야 반영. ⚠️ **백엔드 대량 수정 세션이면 dev는 `SKIP_PREFETCH=1`로 띄울 것** — `fastapi dev`(--reload)는 백엔드 `.py` 저장마다 lifespan 재실행→프리페치(1~2분) 재시작이라 "영원히 안 끝나는" 것처럼 보임. 서버 종료는 Ctrl+C 또는 `Get-CimInstance Win32_Process -Filter "Name='python.exe'"` 후 PID 직접 종료(부모+자식+spawn 워커 다 죽일 것).

**의도적으로 보류**: **Docker화(Dockerfile·docker-compose, 나중 작업)** · Redis(분산 캐시, 나중 작업) · LLM 종목 한 줄 요약(나중 작업) · async httpx(병목=업비트 레이트리밋이라 실익 음). (※ TypeScript(strict 포함)·다크모드·테스트·AI 리포트·환경변수화는 완료돼 보류 해제.)

## 작업 이력

> 더미 데이터 POC로 시작 → 점진적 고도화 → 업비트 실연동/캐싱/로깅 → 유니버스 전체 확장. (Claude Code 협업 기록 기반)

### Phase 0 — 환경 설정
- `requirements.txt` 의존성 설치, 프론트 `vite: command not found` 해결.
- **Node 버전 이슈**: VSCode bash 터미널이 20.17.0을 잡던 문제 → nvm 초기화를 `~/.bash_profile`이 아닌 **`~/.bashrc`** 에 추가, Node 22.x로 교체, `node_modules`/`package-lock.json` 재설치.

### Phase 1 — 대시보드·마켓·코인목록 고도화 (초기 POC, 더미 데이터)
- **대시보드**: 카테고리 누적수익률 차트에 기간 드롭다운(월/분기/년, '일' 제외) + 데이터 범위 6개월 → 5년. "로딩중" 문구 → 스피너 컴포넌트로 전면 교체.
- **마켓 현황**: recharts 우향 애니메이션 제거(`isAnimationActive={false}`).
- 페이지별 "추가할 항목" 제안 후 일괄 반영:
  - **대시보드**: 공포·탐욕 게이지(SVG), 시장 지배력 도넛, 급등·급락 피드, 카테고리 상관관계 히트맵.
  - **마켓**: 하락률 상위 테이블, 거래대금 TOP5 바차트, 52주 신고가/신저가 배지, 레이아웃 재구성.
  - **코인목록**: 3단계 정렬(내림차순→오름차순→해제), 종목명 정렬, 필터 탭(전체/즐겨찾기/상승/하락/보합), 즐겨찾기(localStorage), 52주 위치 바, **행 전체 클릭** 상세 이동.

### Phase 2 — 신규 페이지 + 코인상세 고도화
- **코인상세**: MA/볼린저/RSI 지표 토글(lightweight-charts), 타 종목 피어슨 상관관계 섹션.
- 신규 페이지 3종: **비교분석(`/compare`)**, **전략 백테스트(`/backtest`)**, **코인 스크리너(`/screener`)**.
- 백엔드: `backtest_service`(MA 크로스·RSI 역추세, SMA/RSI/MDD), `analysis` 상관관계 엔드포인트 추가.
- (이 지점에서 1차 컨텍스트 압축 발생)

### Phase 3 — 커서 스타일 통일
- 클릭 가능 요소에 `cursor-pointer` 통일, disabled 버튼엔 `disabled:cursor-not-allowed`.
- 일반 텍스트엔 `cursor-default`를 넣지 않기로 결정(브라우저 기본값 유지가 UX상 옳음). 기존에 적용된 `cursor-default`는 없었음(확인).

### Phase 4 — 사용 설명서(`/help`)
- 페이지별 기능·동작·이동 경로를 정리한 `/help` 페이지.
- 처음엔 라우트/모달로 만들었다가, 사용자 피드백("모달 말고 팝업 = 새 창")에 따라 **`window.open` 별도 창**으로 변경. Layout(헤더) 밖 단독 라우트로 분리, 창 내 경로 링크는 `window.opener`로 메인 창을 이동.

### Phase 5 — API 명세 문서
- `references/API.md` 작성(엔드포인트·파라미터·스키마·프론트 매핑). FastAPI 자동 문서(`/docs`, `/redoc`)와 별개의 수기 명세.

### Phase 6 — 업비트 실연동 (더미 → 실데이터)
- 업비트 시세 API는 **무인증**임을 확인(거래소 API의 권한 체크박스 불필요).
- `clients/upbit_rest.py`를 동기 httpx로 재작성, `/market/all` 추가, 캔들 unit/`to` 페이지네이션.
- `market_service`/`candle_service`를 실연동(현재가·한글명·호가·체결·요약·52주·스파크라인·캔들). 마켓 유니버스/카테고리를 `core/config.py`로 중앙화.
- 상장폐지된 `KRW-MATIC` → `KRW-POL` 교체(`/market/all` 필터로 발견).

### Phase 7 — 성능 개선 (캐싱)
- 측정: `tickers` 콜드 ~5s(스파크라인 캔들 팬아웃), `correlation` 콜드 ~1.8s. 429도 실제 발생.
- `core/cache.py`를 **stale-while-revalidate + single-flight**로 개선.
- **일봉 캐시 통합**: 종목별 200개 1회 fetch 후 슬라이스 공유 → 상관관계 1796ms→5ms.
- `upbit_rest`에 전역 스로틀 + 429 재시도. `main.py` 부팅 프리페치(워밍).

### Phase 8 — 통합 로깅 (rid 상관 추적)
- `core/logging.py`: `contextvars` 기반 요청 ID(rid) + 공통 로그 포맷(Filter로 자동 주입).
- 3계층: axios 인터셉터(`api/client.js`) / FastAPI 미들웨어(`main.py`) / httpx `event_hook`(`upbit_rest.py`). `X-Request-Id` 헤더 전파, CORS `expose_headers`.
- 검증: 한 요청 → 인바운드 1 + Upbit 17건이 동일 rid로 묶임.

### Phase 9 — gitignore 정리 & 문서화
- `.gitignore`: `references/*.md`·`CLAUDE.md`·`docs/*.md` 추적 허용, `references/QAE_EDA_*`(원본 기획서) 제외(`git rm --cached`로 추적 해제, 로컬 보관).
- `README.md`/`references/API.md`를 실연동·캐싱·로깅·`/help` 기준으로 갱신.
- `references/프로젝트계획서.md`(원본 기획서 기반 적용본), `CLAUDE.md`, `docs/HISTORY.md` 신규.

### Phase 10 — 분석 유니버스 전체 확장 & 시각화 개편 (2026-05-24)
- 분석 유니버스를 업비트 KRW 마켓 전체(~261종)로 확장(`config.USE_ALL_KRW_MARKETS`). 일봉/스파크라인 캐시 장기화로 팬아웃 부하 억제.
- **리스크-수익 산점도 개편**: 전 종목 대상, 분포 본체(IQR 펜스)만 산점도로, 색상=1개월 수익률(상승 빨강/하락 파랑), 극단값 종목은 하단 표로 분리.
- **마켓현황**: 상승률·하락률·거래대금 20위 표 + 시장 트리맵을 거래대금 상위 30(메이저)으로 한정.
- **코인목록** 미니그래프를 1일(1시간봉 24개) 스파크라인으로 변경(`TTL_SPARKLINE`).
- **스크리너** 등락률 스케일 버그 수정(소수→%) + 프리셋 기본값을 유니버스에 맞게 조정.
- **비교분석**: Y축 고정(-30~50%), 검색·스크롤 그리드 선택, 초기화 버튼, 종목별 캔들 캐싱으로 기존 라인 재요청·재애니메이션 없이 추가.
- **대시보드** 카테고리 차트(월별·누적·상관관계)에 "예시" 배지 표기.
- **문서 통합**: `HANDOFF.md`·`docs/HISTORY.md`를 본 `CLAUDE.md`로 통합(중복 제거). README/API.md/계획서의 "유니버스 15종" 표기를 ~261종으로 정합, API.md/README의 `/analysis/correlation` 누락 보강.

### Phase 11 — 거래대금 기준 정렬 통일 (2026-05-25)
- 발단: 실제 화면 검증 중 "코인목록 기본 정렬 기준이 뭐냐" → 거래대금순(인기 종목 우선)으로 통일하기로 결정. (Phase 10 마무리 중 세션 한도 도달로 중단됐던 작업을 이어서 완료.)
- **백엔드 `market_service.get_tickers()`**: 반환 직전 `acc_trade_price_24h` 내림차순 정렬. 캐시는 raw 응답만 보관하고 정렬은 매 호출 수행이라 캐시 무효화 불필요. 이 한 소스를 따르는 코인목록·비교분석·스크리너·대시보드 산점도가 모두 거래대금순으로 정합(`get_coin_stats()`도 `get_tickers()` 재사용).
- **코인목록(`CoinList.jsx`)**: 초기 `sortKey`를 `acc_trade_price_24h`(desc)로 설정해 헤더에 정렬 표시(↓) 노출.
- **마켓현황은 예외**: 상승률/하락률/거래대금 상위 등 의미상 다른 정렬을 유지. (단 상단 대표 카드 4개는 하드코딩 `FEATURED` 제거 → `byVolume.slice(0,4)`로 거래대금 상위 4개 동적 노출. 업비트 ticker가 시총 미제공이라 시총순은 불가, 거래대금이 정답.)
- 검증: uvicorn 기동(Windows cp949 콘솔에서 `fastapi dev`의 이모지 배너가 `UnicodeEncodeError`로 죽어 `PYTHONIOENCODING=utf-8` + `uvicorn` 직접 실행으로 회피) 후 `/api/markets/tickers` 261종 전부 거래대금 내림차순 확인(SOON·ONDO·XRP·BTC… 순).

### Phase 12 — 사용자 요청 UI/UX 개선 묶음 (2026-05-25)
- **부팅 프리페치 확장 + 동기화**: `main.py:_prefetch`가 `get_coin_stats()`(일봉 팬아웃)까지 워밍. 이후 **백그라운드→동기로 전환**(`await asyncio.to_thread(_prefetch)`) → 워밍 완료 후 기동하므로 첫 사용자도 콜드 없음(기동 1~2분↑ 감수). 캐시는 프로세스 전역(인메모리)이라 단일 인스턴스 전제(멀티 인스턴스는 Redis 등 공유 캐시 필요 — 보류). 종목별 데이터(호가·체결·캔들·상관관계)는 호출 수/실시간성 때문에 프리페치 제외.
- **마켓현황 상단 4개 카드**: `Market.jsx` `FEATURED` 하드코딩 제거 → `byVolume.slice(0,4)`(거래대금 상위 4개 동적). 업비트 Open API ticker는 시총 미제공(시총은 데이터랩 별도 계산)이라 거래대금이 정답.
- **코인상세 레이아웃**: 차트(320px 고정)/호가창(~720px) 높이 불균형 해소 — 차트+호가 카드를 `h-[560px]` 동일 높이로 묶고, 캔들차트는 `autoSize`로 카드 채움, 호가창은 카드 높이 내부 스크롤(맨 위 기준 — 중앙 스크롤 시도했다 사용자 요청으로 철회).
- **부가기능 허브 분리**: 비교·백테스트·스크리너를 메인 헤더 탭에서 제거 → 헤더 '부가기능' 버튼이 `window.open('/tools')`. 새 창 `ToolsHub.jsx`가 3개를 탭 전환(Layout 밖 단독 라우트). 메인 탭은 3개로 축소.
- **헤더 sticky**: `sticky top-0 z-50`.
- **마켓 트리맵 색상 범례**: 상승(빨강)/하락(파랑) + "칸 크기=거래대금·진할수록 등락폭 큼".
- **스파크라인 개선**: 코인목록·마켓 상위4개 미니차트 Y축을 `[dataMin,dataMax]`로(0 기준 제거) 변동성 가시화 + 호버 시 가격 툴팁(`Tooltip`).
- 검증: 프론트 ESLint 통과. **실제 브라우저 육안은 미검증**(서버 꺼둠) — 콜드스타트 캐시 워밍 수십 초.

### Phase 13 — 카테고리(섹터) 분류 실데이터화 + 스파크라인 툴팁·52주 판정 수정 (2026-05-26)
사용자 요청 묶음. 의사결정 상세는 엔지니어링노트 §11~16.
- **스파크라인 호버 툴팁(코인목록 1일)**: 80×32px 차트에서 커서 추적 툴팁이 그래프를 덮던 문제 → `allowEscapeViewBox`+`position={{x:0,y:-26}}`+`pointerEvents:none`으로 차트 위쪽 바깥 고정. (§16)
- **52주 신고가/신저가 판정**: `price ≥/≤ 52주가`(전수 0개·죽은 기능) → 업비트 `highest/lowest_52_week_date`가 **오늘(KST)인지**로 변경(`market_service.py`). 거래소 표준(그날 경신 종일 유지). (§11)
- **업비트 코인 분류 스크랩**: 공식 API 없음 확인(`datalab-api`는 일괄 400) → 데이터랩 `/sector?tab=marketMap` Next.js RSC 페이로드에서 261종 섹터(level1/2/3)+marketCap 정규식 추출 → `app/data/upbit_sectors.json` 정적 스냅샷. (§12)
- **config 통합**: `MARKET_CATEGORIES`(영문 15종 수동) → JSON 로드(261종 level1). `CATEGORY_LIST`·`MARKET_SUBCATEGORIES` 추가. `TTL_CATEGORY=1800`.
- **카테고리 수익률 실데이터화**(`analysis_service` 재작성): 더미(`_MONTHLY_RAW`·`_make_cumulative_dummy`) 제거 → 섹터 소속 종목 **월봉 close 동일가중 평균**. `_sector_monthly_avg_series()`(월봉 261종, 캐시) 공용 → monthly(6개월)·cumulative(월12/분기12/년5, period 리샘플)·상관관계(프론트 계산). 스키마 `CategoryMonthly`(고정 5필드)→`CategoryReturns{categories,rows}` 동적. (§13·14)
- **부팅 프리페치 확장**: `_prefetch`에 `get_category_monthly()`+`cumulative(3종)` 워밍 추가 — 월봉 261종 팬아웃(콜드 ~1분)을 **기동 시 1회만**, 이후 클라이언트는 캐시 히트. (성능 원칙 §15)
- **프론트**: `Dashboard.jsx` 영문 키 상수(CAT_COLORS/LABELS/CATS) 제거 → `catColor`(팔레트)+한글 섹터명 직접. `CorrHeatmap` 파라미터화. 누적차트 `data=cumulative.rows`·`dataKey="label"`·`cumulative.categories`. 월별 히트맵·산점도 동일. "예시" `DummyBadge`→"업비트 분류" `SourceBadge`. `useAnalysis` 초기값 `{categories,rows}`.
- 검증: 백엔드 `py_compile` 전체 통과 + 카테고리 monthly(콜드 56s)/cumulative(series 재사용 0s) 실데이터 산출 확인. 프론트 `vite build` 658모듈 성공. ESLint는 사전 존재 `set-state-in-effect` 5건만(이번 변경 무관, 다음 작업). **브라우저 육안 미검증**.

### Phase 14 — 사용자 요청 UI 정리 묶음 (2026-05-28)
사용자가 화면 검증 중 제시한 요청 묶음(원래 11건). 대화 중 캐싱 동작 질문·문서 배치 원칙 정리도 함께. 의사결정은 엔지니어링노트 §17·§18.
- **문서 작업 (대화 중)**: ⑴캐싱 런타임 동작(TTL 표·SWR 3상태·lazy 재검증·fan-out 조건)을 **`README.md` "설계 노트 → 캐시 동작"** 섹션에 정리(처음에 엔지니어링노트에 넣었다 사용자 지적으로 README로 이동). ⑵그 경위로 **문서 배치 원칙 확립** — *엔지니어링노트=회고/포트폴리오용 고민·전략 방향성, README=사실·동작 정보*. CLAUDE.md "문서 역할"에 박고 메모리(`feedback_doc_placement`)에 저장.
- **대시보드(`Dashboard.jsx`)**: ⑴'업비트 분류' 출처 배지(`SourceBadge`) 컴포넌트+사용처 3곳 제거. ⑵시장 지배력 범례 `flex-1`(폭 다 차지)→`w-[150px]`+`justify-center`로 코인명-% 간격 축소. ⑶공포·탐욕 게이지 라벨 잘림 — `viewBox 115→128`·height `110→122`로 확장(라벨 `y=120`이 잘리던 것). ⑷24h 총 거래대금 `fmtBillion`("1.8조") 제거 → 전체 콤마+작은 KRW(B안), 그 카드만 `text-xl`.
- **상관관계 히트맵(`CorrHeatmap`)**: `table-layout:auto+w-full`이 긴 한글 섹터명을 공백에서 줄바꿈 → 헤더·행라벨 `whitespace-nowrap`+색점 `flex-shrink-0`, `overflow-x-auto` 안전망. (이후 데이터 컬럼 폭을 균등 분할하기 위해 `table-fixed`로 전환 — 좌측 라벨 컬럼만 `w-40` 고정, 나머지 섹터 컬럼은 남는 폭을 동일 분할. 좁아진 칸에서 긴 섹터명이 넘치지 않도록 **헤더의 `whitespace-nowrap`은 제거**해 칸 안 줄바꿈 허용, 좌측 행라벨은 `w-40`이라 nowrap 유지.)
- **마켓(`Market.jsx`)**: ⑴52주 신고/신저 배지를 거래대금 상위 30종(`W52_LIMIT`)으로 한정(잡코인 신저가 노이즈 제거, §18). ⑵상단 카드 `MiniCard` 가격에 작은 KRW 접미사. ⑶거래대금 상위 `VolumeTable` `fmtVolume`("2800억") 제거 → B안 전체 콤마+KRW. ⑷트리맵 `TreemapCell` 고정폰트+`width>55&&height>38` 게이트 제거 → 칸 크기·이름길이 기반 동적 폰트(6.5~13px), %는 두 줄 여유 시만(§17 연장).
- **코인목록(`CoinList.jsx`)**: 상단 요약 4개 카드(대시보드 KPI와 중복: 총거래대금·BTC도미넌스 동일)가 구조 중복 → 제거. 죽은 `SummaryCard`·`useMarketSummary`·`summary`/`sLoading`·import 정리. 표는 유지(거래대금 컬럼 억 단위 유지).
- **부가기능 헤더 탭 복귀**: 별도 창(`/tools`·`ToolsHub.jsx` 삭제) → 비교·백테스트·스크리너를 **헤더 탭 6개**·Layout 라우트로 환원(`Header`·`App`). 진입 즉시 디폴트 결과(비교 BTC·ETH·XRP 기본선택 / 백테스트 BTC·MA크로스 자동실행 / 스크리너 '급등주' 자동실행). 빈 안내문은 공용 `?` 툴팁 `InfoTooltip`로 대체. 자동실행이 `set-state-in-effect` 신규 발생하지 않도록 Backtest는 `Promise.resolve().then`(마이크로태스크), Screener는 `didInit` ref 가드 + deps disable 주석으로 처리(엔지니어링노트 §9 재검토).
- **도움말 정리**: 기능 행 태그가 flex 축소로 세로 쪼개짐(`표→시`) → 래퍼 `flex-shrink-0` + 태그 `whitespace-nowrap`. 상단 범례 `flex-wrap`→균등 3열 그리드. stale 텍스트(7일→1일·"더미"→실데이터·52주 상위30·상위20/거래대금표) 정정.
- **대시보드 상관관계 좌측 열 폭**: 월별 수익률 표(`w-40`)와 폭이 달라 보임 → `CorrHeatmap` 좌측 th도 `w-40`으로 통일.
- 검증: 변경마다 `vite build` 658모듈 성공. ESLint 신규 0(사전 존재 5건 유지). 도움말·대시보드는 **Edge headless 스크린샷으로 육안 확인**(태그 정상·KRW 표기·공포탐욕 라벨·상관관계 폭 통일).

### Phase 15 — UI 업비트 톤 대개편 + 콘텐츠 재배치 (2026-05-29)
사용자가 "UI가 업비트 같지 않다"며 톤 개선을 요청. 진단/의사결정은 엔지니어링노트 §19~21. (대화 초중반엔 작은 UI 수정들을 핑퐁으로 처리 → 공포탐욕 게이지 라벨 겹침·시장지배력 간격·급등급락 divide 넘침/5종목·누적수익률 마우스 보간·상관 히트맵 동적 스케일·산점도 호버 영역·산점도 범례 2줄 등. 이후 "한 번에 다 해라"로 전환.)
- **토대**: `index.css`에 `@theme` 색 토큰(`--color-brand-50~800`, 업비트 블루 `#1763b6`/네이비 `#093687`) + Pretendard CDN import + 페이지 배경 회색·탭형 숫자. `src/theme.js`(SERIES·DOM_COLORS). `src/components/ui/`(Spinner·Card/CardHeader·StatCard·PageHeader).
- **액센트 일괄 교체**: 8개 페이지 `indigo-*`→`brand-*`, `rounded-lg`→`rounded-md` (replace_all). Layout 배경 `bg-white`→`bg-gray-50`.
- **로고/아이콘**: 시안 막대 3개 → 제거. 헤더는 **흰 기울임꼴 워드마크 `UPquant`만**(원형 아이콘 없음 — 사용자 명시). `favicon.svg`는 파란 원+흰 기울임 "UP"(과거 보라 마크 교체). 헤더 탭 글씨 볼드.
- **구분색 팔레트 통일**: Dashboard `CAT_PALETTE`→`SERIES`, `DOM_COLORS` import, Compare `COLORS`→`SERIES` (튀던 indigo/emerald/violet 정리).
- **콘텐츠 재배치**: 대시보드 `누적→상관→월별`을 `누적→월별→상관`으로(상관은 월별의 파생이므로 원천 뒤). 마켓 "시장 현황" 트리맵 카드명→"거래대금 비중 지도"(페이지명 "마켓 현황"과 중복 제거), 주요종목 4카드에 "거래대금 상위" 라벨 추가. PageHeader 전 페이지(대시보드·마켓·코인목록·비교·백테스트·스크리너) 적용.
- **부수**: 작업 중 Help.jsx의 문법 오타(`const tones = {Z`) 발견·수정.
- 검증: `vite build` 통과(647ms). ESLint 신규 0(사전 5건 유지). **브라우저 육안 미검증**(`npm run dev`로 확인 필요, Pretendard는 인터넷 필요).

### Phase 16 — IA 재편 + 대시보드 하이라이트 + 차트/색 디테일 (2026-05-29)
사용자가 "난잡하다, 투자 인사이트를 얻는 게 의도"라며 전 페이지 배치 검증을 요청. 대화 전반은 작은 디테일 핑퐁(아래) → 후반에 IA 재편으로. 의사결정은 엔지니어링노트 §22.
- **차트/색 디테일(전반)**: ⑴favicon `svg`→`public/favicon.png`(원형 테두리 UP 로고)로 교체, `index.html` `rel/type` 변경. ⑵`DOM_COLORS` 단일 블루 농담→hue 분리(블루·teal·amber·violet+기타 회색) — "도넛이 다 파래서 구분 안 됨". ⑶누적수익률 차트: `세로 확대` 버튼(1~3x, 높이만)·기본 높이 220→380·`type=linear`→`natural`(사용자 선택, monotone 경유)·YAxis 자동→양쪽 헤드룸 도메인. ⑷월별 히트맵 셀에 `rounded` 추가(상관 히트맵과 통일 — "왜 한쪽만 네모냐"는 단순 누락이었음). ⑸`SERIES` 팔레트 전체 밝게(너무 어둡다) → 비교·백테스트도 함께 밝아짐.
- **IA 재편(후반)**: 난잡함의 실제 원인을 전수 진단 — ⓐ대시보드↔마켓 정보 중복(급등급락≈상승/하락상위, KPI≈주요종목/트리맵) ⓑ대시보드 과적재(카테고리 3종+산점도) ⓒ헤더 6탭 위계 없음. 사용자가 "탭 줄이면 빈약/메인인데 너무 없다"를 우려 → **탭을 줄이지 않고 오히려 1개 늘리되 그룹화**하는 방향 채택.
  - **헤더**: `tabs`(6 flat)→`tabGroups`(2그룹) — **시장 파악**(대시보드·마켓·섹터분석·코인목록)│구분선(`w-px bg-white/25`)│**분석 도구**(스크리너·비교·백테스트). 7탭 전부 노출.
  - **섹터 분석 `/sectors` 신설**(`pages/Sectors.jsx`): 대시보드에서 카테고리 누적·월별·상관 히트맵 + 리스크-수익 산점도(+극단값 표)를 **그대로 이동**(헬퍼 CumulativeChart·CorrHeatmap·HeatmapCell·ScatterDot·pearson·bulkRange 등 동반). `App.jsx` 라우트 추가.
  - **대시보드 슬림화 후 하이라이트 보강**: 카테고리/산점도 제거로 허전해지자(사용자 지적) **3번째 줄에 하이라이트 카드 3개** 추가 — 이번 달 섹터 성과(월봉 최신월 강/약 컬러바→`/sectors`)·거래대금 상위 Top5(미니 AreaChart 스파크라인→`/coins`/행클릭 상세)·52주 신고/신저 요약(상위30 중 오늘 경신 카운트+배지→`/market`). 전부 프리페치된 tickers·월봉 사용(콜드 0). `useCategoryMonthly`를 대시보드가 다시 사용.
  - **히어로 차트 추가**(사용자 "그래도 너무 없어보인다·작은 박스만 몇 개"): 균일한 작은 카드만 10개라 **focal point 부재**가 진짜 원인 → KPI 아래에 **전폭 비트코인 추세 AreaChart**(`HeroChart`, BTC/KRW 시장 대표 지표, 3·6·12개월 토글, 자체 로딩) 추가. BTC 일봉 단일 1콜(팬아웃 아님). 랜딩이므로 **부팅 프리페치에 `get_candles(KRW-BTC, days, 90)` 추가**(`main.py`) → 첫 방문도 콜드 0. 6개월/1년 토글만 on-demand.
  - **도움말**: 대시보드 항목에서 옮긴 3기능 제거(+급등급락 4→5종목 문구 정정), `/sectors` 가이드 신설.
- 검증: `vite build` 통과(660+ 모듈). ESLint 신규 0(Sectors/Dashboard/Header/App). 백엔드 `py_compile` 통과. **브라우저 육안 미검증** — 특히 히어로 차트(BTC 추세)·섹터분석 신설·헤더 7탭 2그룹·대시보드 하이라이트.

### Phase 17 — 빌드 복구 + IA 잡정리 + 마켓·코인목록 개편 (2026-05-30 전반)
사용자 지시 "README 진행 중 체크리스트 0번부터 최우선". Phase 16 끝물에 사용자가 부분 수정만 한 채 토큰 한도로 끊겼던 깨진 상태를 복구·완결. 이번 세션은 메모리 새 규칙 두 개 정착: `feedback-no-confirmation`(코드 컨펌 X, task 경계 O), `feedback-docs-on-request`(문서 갱신은 시킬 때만).
- **0. Sectors.jsx 빌드 깨짐 복구** — Phase 16에서 산점도를 마켓으로 옮기려고 헬퍼/import만 삭제했는데 `Sectors()` 본문은 그대로 참조해 빌드 실패. ⑴`useNavigate`/`useCoinStats`/`statsLoading` 제거(로딩 가드 `monthlyLoading`만) ⑵scatter 계산 블록·산점도/극단값 표 JSX 섹션 삭제 ⑶최상단에 **섹터 안내 카드** 신설(`monthly.categories` × `CAT_DESC`, 2-col 그리드 — 죽은 페이지 살리기).
- **ESLint `react-hooks/set-state-in-effect` 5건 일괄 해결** — `loading`을 상태로 들지 않고 `loadedKey !== currentKey` **파생값**으로 바꿔 effect 안 `setLoading(true)` 호출 제거(cascade render 회피). 적용: `useTicker(market)`·`useCandles(market|interval|count)`·`useCategoryCumulative(period)`·`useCorrelation(market)`·`Compare(loadingChart = selected.some(m => !candlesByMarket[m]))`. 부수로 모든 effect에 `cancelled` cleanup 추가(빠른 dep 변경 시 stale fetch가 새 데이터 덮어쓰는 race 차단 — 파생 loading 정확성에 필수). 의도 변화: dep 바뀌면 새 데이터 올 때까지 옛 데이터 stale 표시+`loading=true`(원래도 거의 동일).
- **PostCSS `@import must precede` 경고** — 사용자 dev 로그에서 발견. Tailwind v4가 `@import "tailwindcss"`를 펼치며 후속 규칙을 위에 박아 Pretendard `@import`가 결과 CSS ~1319행으로 밀려나 **표준상 무시됨 → Pretendard가 실제로 로드 안 되고 시스템 폰트 폴백 중이던 진짜 버그**도 함께 수정. Pretendard를 `index.html` `<link rel="stylesheet">`+`preconnect`로 이동. CSS에는 사유 주석만.
- **Phase 17-1 마켓 RANK_LIMIT 20→10**: 상승률/하락률/거래대금 표를 한 화면 부담 없는 분량으로 축소. Help.jsx 안내도 갱신.
- **Phase 17-2 리스크-수익 산점도를 섭터→마켓현황으로 이식**: 헬퍼(`quantile`·`bulkRange`·`padDomain`·`lerp`·`returnColor`·`ScatterDot`) + 상수 `SCATTER_LIMIT=100`(원래 정의 없이 참조만 있던 버그도 함께 해결, 거래대금 상위 100종 — 메이저+준메이저). Market.jsx 트리맵 뒤에 분포 본체(IQR 펜스) 산점도 + 극단값 표(행 클릭 상세). `useCoinStats()` 추가. Sectors는 더 깔끔하게 섹터-only.
- **Phase 17-3 코인목록 업비트식 master-detail**: CoinDetail.jsx 본문을 `CoinDetailView({market})` named export로 분리(default export는 `useParams` wrapper). CoinList.jsx를 좌 col-9 메인(CoinDetailView) + 우 col-3 슬림 사이드바(검색/필터탭/정렬 헤더 한글명·현재가·전일대비·거래대금/★ 즐겨찾기/선택 강조 `bg-brand-50`)로 재작성. App.jsx 라우트 `/coins`+`/coins/:market` 둘 다 CoinList로(market 없으면 KRW-BTC 디폴트). 사이드바 sticky `top-[68px]`+내부 스크롤. 옛 CoinList의 1일 스파크라인·52주 위치 바는 슬림화 비용으로 제거.
- 검증: 단계마다 `vite build`+`npm run lint`+백엔드 `py_compile` 통과(660+ 모듈). ESLint 신규 0(사전 5건도 함께 해결돼 0). **브라우저 육안 미검증**.

### Phase 18 — IA·인사이트 + 허세용 지표 (2026-05-30 후반)
페이지 구성 분석(`pages.md` 신설) → 사용자 + 다른 LLM 제안 교차 검토 → 통합 우선순위(P0~P3 9개)로 큰 로드맵 확립. P0~P1까지 완료, P1-2 이후는 다음 세션. **체크리스트 단위로 진행 여부 확인 규칙 정착**(memory `feedback-no-confirmation` 보강 — 토큰 한계 고려, 자동 연속 진행 금지).
- **백테스트 Sharpe/Sortino/Calmar** (가벼운 인상 보강 1) — `backend/app/services/backtest_service.py:_compute_risk_adjusted()` 신규. 일별 equity 수익률(`equity[i]/equity[i-1] - 1`) → Sharpe = `(avg/std) × √365`, Sortino = `(avg/하방std) × √365`(하방 = 음수 수익률만), Calmar = `연율화수익률 / (MDD/100)`. BacktestMetrics 스키마 3필드 추가, MA·RSI 둘 다 호출. 프론트 `Backtest.jsx`에 3-카드 행 추가(MetricCard에 `sub` 옵션 추가, `raColor` 헬퍼로 양수 빨강/음수 파랑/0 부근 회색). 검증: BTC MA 200일 → Sharpe -0.05/Sortino -0.06/Calmar -0.24(음수=손해, 합리적).
- **P0-1 분석 카트** (Screener→Compare→Backtest 흐름 연결) — `contexts/AnalysisCart.jsx`(Provider + Context, localStorage 영속, 배열 + has·add·remove·toggle·clear) + `contexts/useAnalysisCart.js`(hook 분리, react-refresh/only-export-components 규칙 대응). 공용 `components/CartButton.jsx`(원형 +/✓ 토글, stopPropagation 필수). 헤더 우측에 `CartIndicator` — 아이콘+카운트 배지(red-500)+클릭 드롭다운(담긴 종목 ×해제·비교/백테스트 진입 버튼·비우기·바깥클릭/ESC). 종목 행/카드 5곳에 + 버튼: Dashboard 시세표·Market 3종 표(상승/하락/거래대금 + 산점도 극단값)·CoinList 사이드바·Screener 결과·Sectors 드릴다운 모달. Screener에 "결과 전체 카트 담기" 추가 액션. Compare/Backtest 진입 시 카트 종목으로 초기 selected 자동 채움(Compare 상위 5, Backtest 첫 종목).
- **P0-2 Sectors 섹터 드릴다운** — `SectorDrilldownModal`(섹터명 클릭 → 모달로 소속 종목 표). useCoinStats(category) + useTickers(현재가) 결합, 거래대금 desc 정렬, 헤더에 종목 수·1개월 평균 수익률·24h 총 거래대금 통계, 카트 버튼·행 클릭 상세 이동, ESC/바깥/×로 닫힘. 백엔드 변경 없음(기존 데이터 재활용). 섹터 안내 카드를 `<button>`으로 전환, hover 시 brand 컬러 + → 아이콘.
- **P1-1 Opportunity Feed** (Dashboard "오늘의 시그널" 액션 트리거) — Dashboard 최상단에 4-카드 신규. ⑴52주 신고/신저 경신(상위 30 한정, 빨강/파랑 분리) ⑵급등(전일 >+2%) ⑶안정 상승 모멘텀(1개월 +5% 이상·변동성 5% 이하·`return_1m/volatility` 비율 상위 — Sharpe 풍 단순화) ⑷섹터 로테이션(이번 달 vs 지난 달 ▲▼ 변화 큰 섹터). 신규 헬퍼 `StockChip`(클릭 상세 + 카트 통합 디자인), `SignalCard`(액센트 바·카운트·우상단 페이지 링크). 백엔드 신규 없이 기존 데이터(tickers·coinStats·monthly) 합성.
- **공통**: 단계마다 `vite build`+`npm run lint`+`py_compile` 통과. 신규 ESLint 0. `pages.md`(로컬 메모) 신설로 페이지 구성·중복·개선 항목 트리 정리 + 큰 그림.

### Phase 19 — 퀀트/ML 분석 묶음 + 퀀트 랩 (2026-05-31)
사용자 요청으로 P1-2(Markowitz)에서 출발 → "정량 분석을 최대한 많이"로 확장. 방침: **있는 모델은 라이브러리, 없는 건 numpy**(직접구현 정체성은 캐시·로깅·API 계층에 이미 있으므로 통계/ML은 검증된 라이브러리 사용). 예측형보다 **구조·리스크 분석** 중심(엔지니어링노트 §28).
- **의존성 도입**: numpy·scipy·scikit-learn·statsmodels·arch·hmmlearn·networkx (+pandas 자동). `requirements.txt` 갱신.
- **공용 기반** `services/quant_service.py`: `returns_matrix(markets, count, kind, min_len)` — 종목별 일봉 close를 공통 길이 numpy 행렬로. **기존 공용 일봉 캐시 재사용 → 추가 팬아웃 0, 계산만**. `min_len` 필터로 신규 상장 코인이 상관 윈도우 갉아먹는 것 방지(네트워크 n_obs 34→94로 개선).
- **8기능**(각 `/api/quant/*` + `schemas/quant.py`): ⑴**Markowitz** 효율적 경계선(무작위 1000 Dirichlet 시뮬 + scipy SLSQP 최대샤프★/최소분산, long-only) ⑵**상관 네트워크 MST**(Mantegna 거리 √(2(1−ρ)) + networkx 최소신장트리, 허브 degree·섹터색) ⑶**PCA**(sklearn, 표준화 수익률 → PC1=시장요인, 종목 로딩 ≈ 베타; USDT 음수 로딩으로 검증) ⑷**클러스터링**(K-means 변동성·수익률·거래대금 + scipy 계층 덴드로그램) ⑸**GARCH(1,1)**(arch, 조건부 변동성·향후 10일 예측·1일 95% VaR·지속성 α+β) ⑹**횡단면 모멘텀 팩터 백테스트**(과거 lookback 수익률 상·하위 분위 롱숏 달러중립, 동일가중 벤치) ⑺**공적분 페어트레이딩**(statsmodels Engle-Granger coint, 상관 게이트 + OLS 헤지비율 + 스프레드 z; VTHO-VET 등 동일생태계 페어 검출) ⑻**HMM 국면**(hmmlearn 가우시안, [수익률, 롤링변동성] 2피처로 평온/격동 2국면 — 수익률만 쓰면 195/199 과전환 → 변동성 피처+k2로 9회 안정).
- **부팅 프리페치**(`main.py`): 퀀트 9종(네트워크·PCA·클러스터·덴드로·모멘텀·페어·국면·기본 포트폴리오/GARCH) 워밍 추가. 콜드 총 ~150s(섹터 월봉이 대부분, 퀀트는 소수).
- **프론트**: `pages/QuantLab.jsx`(8 서브탭 lazy 마운트, **d3-force** 네트워크 SVG·scipy 좌표 SVG 덴드로그램·recharts 나머지)·`api/quant.js`·`hooks/useQuant.js`(loadedKey 파생 로딩). 헤더에 **별도 "퀀트 랩" 탭**(앰버 강조, /quant). 각 섹션 제목에 `InfoTooltip` 방법론 설명.
- 검증: 8기능 전부 실데이터 산출 확인, `py_compile`·`vite build`·ESLint 통과. **브라우저는 네트워크 탭 1건만**(d3-force가 link.source/target을 노드객체로 치환하는 것 미반영 → 좌표 명시 해석으로 수정). 나머지 7탭 런타임 미검증.

### Phase 20 — 탐색 통합 + 코인상세 강화 + 포트폴리오 백테스트 (2026-05-31)
P2-1~P2-3 묶음.
- **P2-1 탐색 통합**: `pages/Explore.jsx` 신설 — Market·Sectors·Screener를 `/explore` 단일 페이지의 **URL 기반 서브탭**으로(경로 `/market`·`/sectors`·`/screener`가 곧 초기 탭, 딥링크 호환). 기존 페이지 본문을 그대로 재사용(자체 로딩, lazy 마운트). 헤더 `tabFromPath` 매처로 어느 경로든 "탐색" 활성. 메인 탭 `대시보드·탐색·코인목록`(마켓·섹터 흡수), 더보기는 비교·백테스트만(스크리너→탐색). ⚠️ 처음 `useState` 초기탭으로 했다가, /market↔/sectors가 같은 컴포넌트라 리마운트 안 돼 탭 안 바뀌는 버그 → URL 단일출처로 수정.
- **P2-2 코인상세 강화**(`CoinDetail.jsx`): 가격 헤더 아래 **주요 지표 카드**(30일 변동성·1개월수익률 from coinStats / 시장 점유율 = 24h 거래대금÷전체 / **GARCH 연변동성·1일 95% VaR** from `useGarch` — 퀀트 통합) + **52주 위치 바**(현재가 위치 % + 신고/신저 배지).
- **P2-3 포트폴리오 백테스트**: 백엔드 `backtest_service.run_portfolio()`(numpy, 가중 보유 자산곡선 + `rebalance_days`로 주기 리밸런스 + 동일가중 매수보유 벤치마크 + 종목 기여·MDD·샤프·변동성), `/api/backtest/portfolio`. 스키마 `PortfolioBacktestResult` 등 신규. 프론트 `Backtest.jsx` 재구성 — 전략 선택을 공통 카드로 분리, MA/RSI는 `SingleStrategyBody`로, 신규 `PortfolioBacktest`(카트 종목 + 비중 입력 + 리밸런스/기간 + 자산곡선 포트vs벤치 + 기여도). ⚠️ 균등 비중이면 벤치마크와 곡선이 겹침(정상) — 비중 프리셋(Markowitz 최적해) 연결은 이월(다음 작업 1, §28).
- 검증: `vite build`·ESLint·`py_compile`·app import(22 API 라우트) 통과. 포트폴리오 백테스트 실데이터 확인(50/30/20 BTC·ETH·XRP → −29.6% vs 동일가중 −32.5%). **브라우저 육안 미검증**.

### Phase 21 — IA 재편 + 라우트 정리 + 동선/가이드 (2026-06-01)
- ⑴ 분석/도구 분리 마감: 헤더 드롭다운→평탄 탭, "팩터·전략"→"팩터 분석" 개명, 도구의 GARCH 탭 제거(코인상세로 일원화). ⑵ 탐색에 묻혀 있던 서브탭(마켓·섹터·스크리너)을 헤더 탭으로 승격 + 의도별 그룹 구분선. ⑶ **코인 목록을 메인(`/`)으로**(로고=코인목록), 대시보드는 `/dashboard`로. ⑷ 시장구조/팩터 라우트 `/analysis/*`→`/structure`·`/factor`(크로스링크 정정). ⑸ 포트폴리오 동선(축소안): 최적화 ★/◆ 비중 카드에 "이 비중으로 백테스트 →". ⑹ 중복정리: 마켓 거래대금 표·대시보드 W52Summary/MoversFeed 제거(오늘의 시그널로 일원화). ⑺ 시장구조/팩터 상단 "한눈 요약" 스트립. ⑻ 별도 가이드 창 `/guide`(방법론·기술스택). 빌드·ESLint 통과.

### Phase 22 — 상폐 404 버그 + 리스크 탭 + 퀀트 신뢰성(거래비용·생존편향) + 대시보드 관제탑 재구성 + IA 영어화 (2026-06-02~03)
다회 세션 묶음. 대시보드·헤더는 사용자와 여러 차례 핑퐁하며 수렴(의사결정 엔지니어링노트 §29·§30).
- **상폐 종목 404 버그**: `analysis_service.get_correlation`이 섹터 스냅샷 키(`_CATEGORIES`)를 직접 순회해 상폐된 `KRW-DRIFT` 일봉을 fetch → 404가 500으로 전파. ⑴메인: `market_service.valid_markets()`(`/market/all` 교집합)와 교집합만 순회. ⑵안전망: `upbit_rest.get_candles`가 404면 `[]` 반환 → 미래에 다른 종목이 상폐돼도 전체 집계가 안 죽음. (검증: valid_markets 262종에 DRIFT 없음, 상폐 캔들 호출 `[]`)
- **리스크 탭 `/risk` 신설**: `Analysis.jsx`에 risk seg/GROUP/요약 스트립 + 헤더 탭. 3섹션 — 리스크-수익 분포(변동성×1개월수익률 산점도, 거래대금 상위 120)·변동성 분포(일변동성 히스토그램)·VaR 랭킹(정규근사 1일 95% VaR=1.645×일변동성). 데이터=기존 `coinStats`(프리페치) 재사용 → **추가 호출 0**.
- **잔버그 5건**: ⑴Compare 최고/최저 수익률 부호·색 하드코딩(`+-12%` 빨강 오표기) 수정 ⑵Compare Y축 `[-30,50]` 고정→기본 보장+극단 확장(주석 모순 해소) ⑶CoinDetail 지표토글 죽은 `bg-${color}-500` 동적 클래스→hex inline ⑷CoinDetail 호가 막대 `size*25` 임의 스케일→최대잔량 상대(`size/maxDepth`) ⑸Backtest 단일전략 자산곡선 색 `#6366f1`→브랜드블루 `#1763b6`.
- **거래비용(`fee_bps`) 반영** — 퀀트 신뢰성: `backtest_service` 단일전략(진입+청산 ×(1−fee))·포트폴리오(t0 진입+리밸런스 회전 turnover×fee)·`quant_service` 모멘텀(매 리밸런스 롱숏 2×fee 차감). 기본 5bps(업비트 KRW ~0.05%). 라우터·`api/backtest.js`·프론트 입력칸 추가. 스키마: `BacktestMetrics.benchmark_return`·`fee_bps`, `EquityPoint.benchmark`, `MomentumResult.fee_bps`. (검증: MA fee 0→5bps 총수익 2.43%→2.13%)
- **단일전략 buy&hold 벤치마크 + 알파**: 자산곡선에 매수보유 라인(회색 점선) + 5카드(총수익·매수보유·**초과수익 알파**=총수익−벤치·MDD·승률/거래). 단일전략이 "그냥 보유"보다 나은지 가시화.
- **코인상세 음의상관(헤지)**: 상관 카드를 동조(상위7)+헤지 후보(하위7, 음의 상관) 2분할.
- **퀀트 신뢰성 경고 배지**: 백테스트(단일·포트)·모멘텀 결과에 ⚠️ Caveat — "인샘플·생존편향(현재 상장 종목만)·슬리피지/세금 미반영, 미래 보장 아님". 정직성(메모리 `feedback_viz_honesty`).
- **대시보드 관제탑 재구성**(§29): 시세표 제거→복원→위계 재설계의 핑퐁 끝에 — ①KPI 4(24h거래대금·평균등락·**52주 신고/신저**·**거래대금 집중도**; 도미넌스→지배력 도넛·상승비율→시장폭과 중복이라 교체) ②**시장 종합 추세 focal**(전폭·340px; `get_regime` 동일가중 시장지수+HMM 국면 밴드 재활용, 콜드 0) ③오늘의 시그널 ④보조 **균일 4카드**(공포탐욕·지배력·시장폭·섹터) ⑤**시세 요약 표 전폭**. 핵심 교훈: **대시보드의 중복은 "요약본"이라 정당**(상세는 각 페이지), 산만함의 원인은 중복이 아니라 **위계 부재** → focal/시세표를 기둥으로, 보조는 작고 균일하게.
- **IA: 전략도구 → "More" 드롭다운 + 독립 라우트**(§30): 헤더 "서비스 더보기"(영어 **More**) 드롭다운 부활(호버 펼침·빨간점·chevron·아이콘+설명, 업비트 패턴) — 단 과거 `/tools` 단일 페이지 `?tab=` 내부 탭 구조를 **독립 라우트**(`/tools/portfolio`·`/tools/backtest`·`/tools/compare`)로 분리(드롭다운 구분=실제 페이지 구분, 이중 탭바 제거). `Tools.jsx`→3 Page 컴포넌트(`PortfolioPage`·`BacktestPage`·`ComparePage`). 최적비중→백테스트 전달(preset)은 `navigate` state로. `/compare`·`/backtest` 리다이렉트 갱신.
- **헤더 라벨 영어화(A·퀀트 전문 톤)**: `Dashboard`·`Markets`·`Sectors`·`Screener`·`Market Structure`·`Factor Analysis`·`Risk`·`More`(드롭다운 `Portfolio Optimization`·`Backtest`·`Compare`). 실제 플랫폼 표준 용어 검증(TradingView·Portfolio Visualizer·Qlib·Mantegna "market structure"). 본문 콘텐츠는 한글 유지.
- **PageHeader(본문 최상단 제목) 제거**: 헤더 탭 활성이 현재 위치를 보여주므로 Explore·Analysis 본문 중복 제목 제거. **Tools 3종만 제목 유지**(헤더가 "More"로 묶여 개별 식별 안 됨). 마켓↔"시장 현황" 이름 불일치도 해소(헤더와 통일).
- 검증: 단계마다 `vite build`·ESLint·`py_compile` 통과. 백엔드 거래비용/벤치마크 실호출 확인. **브라우저 육안 미검증**.

### Phase 23 — 헤더 한글화 + 차트 버그수정(흰화면 크래시) + 섹터 누적 일봉화 + 로고/배경/공통 푸터 (2026-06-03)
이전 세션 마지막 미완(More 페이지 제목 제거)부터 이어 사용자 요청 UI 묶음 + 버그 수정. 사용자와 다회 핑퐁(특히 헤더 라벨·푸터).
- **헤더 라벨 영어→한글 전문 음차 환원**: Phase 22 영어화를 사용자 요청으로 한글로 — `대시보드·마켓·섹터·스크리너·시장 구조·팩터 분석·리스크·서비스 더보기`(드롭다운 `포트폴리오 최적화·백테스트·비교 분석`). 헤더 그룹 4분할(대시보드 │ 마켓·섹터·스크리너 │ 시장구조·팩터·리스크 │ 서비스 더보기)의 논리(요약→탐색→정량분석→실행도구)는 사용자와 점검 후 **유지 확정**. Tools 3페이지 본문 `PageHeader` 제거(이전 세션 마지막 요청 완수).
- **코인 상세 차트 버그(흰 화면 크래시 포함)**: ⑴TradingView attribution 로고 안 꺼지던 버그 — `attributionLogo:false`가 v5 `LayoutOptions` 소속인데 최상위에 둬서 무시됨 → `layout` 안으로 이동. ⑵**RSI 클릭→흰 화면**: `chart.getSeries()`가 v5에선 `IPaneApi` 소속(chart에 없음)→`TypeError`→에러바운더리 없어 트리 언마운트. `seriesRef`로 직접 추적·제거로 수정. + StrictMode 더블마운트 시 옛 차트 시리즈를 새 차트에서 removeSeries하던 2차 크래시("Value is undefined")도 마운트 effect `seriesRef` 초기화로 해결. ⑶지표 토글마다 `fitContent()`로 줌 리셋되던 것 — 캔들 setData/fitContent(인터벌 변경)와 오버레이 그리기(토글) effect 분리.
- **코인 목록 사이드바**: 한글명 컬럼 `w-20`+truncate, 좌우 비율 17:7(8.5:3.5, 24컬럼 그리드), 정렬 화살표 활성 컬럼만 노출(비활성 `↕` 제거)+화살표 자리 고정폭 예약(토글 시 안 밀림).
- **대시보드 섹터 성과 막대**: 방향색→카테고리별 색상(섹터 페이지 `catColor`와 동일 규칙)+섹터명 색점. 증감률 숫자는 빨강/파랑 유지.
- **섹터 누적수익률 월봉→일봉 전환**(사용자: 호버 시 월 단위 스냅 끊김 지적, A안 선택): 백엔드 `get_category_daily_cumulative()`(섹터별 일봉 동일가중 지수=첫날 1.0 정규화 평균의 누적%, 전 종목 공통 윈도우 `min_len=150`으로 동일 날짜축, 공용 일봉캐시 재사용→팬아웃0)·`/api/analysis/category/cumulative-daily`·프리페치 월/분기/년 3종→일봉 1종. 프론트 `useCategoryDailyCumulative`+`Sectors.jsx CumulativeChart` recharts 표준 `Tooltip`+`activeDot` 재작성(커스텀 픽셀보간 호버 제거)·기간 선택기 제거·`type=monotone`·Y축 상단 기본 50% 보장(초과 확장). 월별 히트맵은 월봉 유지.
- **신뢰성 경고 제거**(사용자 요청): 팩터 분석 모멘텀 하단 "5bps…인샘플·생존편향" 경고 div 삭제, 백테스트 `Caveat`(단일·포트 2곳+정의) 삭제.
- **로고 점 제거**: `public/logo.png` 우측 하단 파란 다이아몬드를 PIL로 투명 처리(구석 텍스트 없음 확인 후 박스 클리어, 원본 git 보존). favicon은 사용자가 별도 교체(건드리지 않음).
- **배경색** `#f4f5f7`→**`#e6eaf2`**(쿨 그레이블루) — body(index.css)+Layout.
- **공통 푸터 신설**(`components/layout/Footer.jsx`, 전 페이지): 좌측 브랜드(logo.png를 CSS `mask`로 네이비 #093687 입힘)+데이터출처 / 네비 3컬럼(둘러보기·정량분석·전략도구) / 안내 / 하단 면책·저작권. **흰 배경은 헤더처럼 뷰포트 full-bleed**, 내부는 `max-w-[1440px]` 중앙정렬, 화면 맨 아래까지(Layout `flex flex-col`+main `flex-1`). 가짜 사업자정보 없이 실제 정보만.
- 검증: 단계마다 `vite build`·ESLint·`py_compile` 통과, 섹터 일봉 누적 실데이터(154일 5섹터) 확인. 브라우저는 사용자 직접 핑퐁 확인.

### Phase 24 — 효율적 경계선 곡선 + 시장구조 2분리 + 신뢰성 경고 정비 + 성능/죽은코드 정리 + 전수 검토 (2026-06-06)
세션 후반 "전 페이지·기능·구현 전수 검토 + 발표 주제 정합성 검증" 요청으로 확장. 발표는 이미 종료됐고(자료는 `references/pt/`), 검토 결과 **서비스가 발표 주제(퀀트 의사결정 5단계 흐름 + 9기법: 상관·PCA·군집·GARCH·HMM·공적분·Markowitz·모멘텀·VaR)에 부합** 확인.
- **효율적 경계선 곡선 추가**(보류였던 "원 뭉침" 진단/개선): 실측 진단 — 뭉침은 ⑴메이저 코인끼리 상관 높아 (vol,ret) 평면에 좁게 몰림(정상) + ⑵Dirichlet(1) 균등샘플이 중심 집중(개선가능)의 복합. **(A안)** `quant_service._compute_portfolio`에 목표수익률 60등분 최소분산 최적화로 **효율적 경계선 곡선**(`FrontierPoint`/`PortfolioResult.frontier`) 생성 + Dirichlet **α 1.0→0.3**(`_SIM_ALPHA`)로 구름 확산. 프론트 `Analysis.jsx` PortfolioSection에 `<Scatter line>` 곡선(구름 위·마커 아래)+범례. 실데이터: 곡선 vol 34.7~38.5%가 개별 종목 최저(BTC 44.8%)보다 낮아 분산효과가 시각화됨.
- **시장 구조 → 2페이지 분리**(사용자 선택: 헤더 탭 2개 + 관계/거시 기준): `/structure` **시장 구조**(상관 네트워크+클러스터링, 종목 간 관계/미시) · `/regime` **시장 국면**(PCA 요인+HMM 국면, 시장 전체 상태/거시). `Analysis.jsx` GROUPS 2분할·`PAGE_META.regime` 추가·`StructureSummary`/`RegimeSummary` 분리, `Header`·`App`·`Footer` 탭/라우트 추가, 크로스링크 `#pca`/`#regime`→`/regime`(Dashboard·Guide), `#network`/`#cluster`는 `/structure` 유지.
- **신뢰성 경고 — 복원·추가 후 전부 제거**: Phase 23에서 지웠던 `Caveat`(인샘플·생존편향)를 발표 주제 정합 위해 복원(백테스트 단일·포트+모멘텀 3곳)+추가(Markowitz·GARCH/VaR·공적분 3곳)했으나, **사용자가 "보기 싫다"며 전부 제거 요청** → amber 경고 박스 6곳 + 모멘텀 InfoTooltip의 ⚠️ 문장까지 모두 삭제(Caveat 컴포넌트도). 결과적으로 Phase 23 상태로 환원(엔지니어링노트에 의사결정 기록). VaR 정규근사 한계는 리스크 탭 지표 설명(툴팁/description)에만 사실 기술로 잔존.
- **B1 스파크라인 팬아웃 축소**: `get_tickers`가 261종 전부 1시간봉 24개 fetch하던 것을 **거래대금 상위 30종만**(`_SPARK_LIMIT`) 채움(대시보드 시세표·마켓 카드만 쓰는 시각 요소). 검증: 263종 중 30종만 채워짐.
- **C1 죽은 누적 코드 제거**: 월/분기/년 누적 체인 전체 — `get_category_cumulative`·`_PERIOD_SPEC`·`_period_key`(서비스)·라우터 `/category/cumulative`(+`Query` import)·api `getCategoryCumulative`·hook `useCategoryCumulative`. 프론트는 `cumulative-daily`만 사용. 라우트 27개 확인.
- **D1 상관 min_len**: `get_correlation`에 공통 관측 40일 미만 종목 제외(`_CORR_MIN_OVERLAP`) — 신규 상장 노이즈 차단, quant `returns_matrix` min_len과 같은 취지.
- **C2 PageHeader 삭제**: 어디서도 import 안 되는 죽은 컴포넌트 파일(`components/ui/PageHeader.jsx`) 삭제. **D2 cache `_locks`**: 검토 결과 `_store`와 동일 유한 키 집합이라 누수 아님 — 주석으로 의도 명확화만(동작 변경 없음).
- **코인리스트 줄아웃 높이 버그**: 메인(`/coins`)에서 배율 줄이면 우측 코인 리스트가 끝없이 길어지던 것 — grid `items-start`로 좌우 높이가 독립이라, 줌 아웃 시 뷰포트(`max-h` vh)가 좌측 상세보다 커지면 우측이 row를 밀어올림. `items-start` 제거(기본 stretch)로 우측 aside가 좌측 상세 높이에 맞춰지게 수정(스크롤 자식 min-content가 작아 row를 안 늘림). ⚠️ 추론 기반 — 브라우저 줌 검증 필요.
- **코인리스트 레이아웃 재수정(세션 내 3회)**: stretch만으론 우측 콘텐츠(261행)가 grid row를 키워 재발 → 최종 **wrapper + `absolute inset-0`**(absolute 자식은 부모 높이에 기여 안 함 → wrapper는 좌측 상세 높이만 따름). 사용자 확인으로 해결.
- **에러 바운더리 신설**(`components/ErrorBoundary.jsx`, Layout의 Outlet을 `key={pathname}`로 감쌈): 한 페이지 예외가 헤더·푸터까지 언마운트하던 것(Phase 23 RSI 흰화면 계기) 차단. fallback(다시 시도·새로고침), DEV 모드 스택 노출, 라우트 변경 시 자동 복구.
- **코인 상세 보강(추가 호출 0)**: ⑴거래대금 순위 Metric(tickers가 거래대금 desc 정렬이라 인덱스=순위, 주요지표 6칸) ⑵호가 매수/매도 압력 바(orderbook bid/ask 총잔량 비율, 매수 빨강·매도 파랑).
- **분석 카트 전면 제거(사용자 재검토 결정)**: Context(`AnalysisCart.jsx`)·hook(`useAnalysisCart.js`)·`CartButton.jsx` 3파일 삭제 + 헤더 CartIndicator + 5개 페이지 CartButton(Dashboard·Market·CoinList·Screener·Sectors) + Screener "결과 전체 담기" + Compare/Backtest 카트 초기값(→기본값 BTC·ETH·XRP) 제거. 사유: 기능적 필요성 낮음(Compare/Backtest 자체 선택 UI로 대체 가능·즐겨찾기★와 개념 중복), 어필 명분(발표)도 종료. (엔지니어링노트 §25 갱신)
- **문서**: CLAUDE.md(규약·UI·성능·라우트·작업이력·다음작업)·`references/API.md`(frontier·cumulative-daily·correlation min_len·엔드포인트 매핑)·pages.md·엔지니어링노트(§32~35)·메모리 갱신. 검증: 단계마다 `vite build`·ESLint·`py_compile`·라우트 27개 통과. **브라우저는 코인리스트만 사용자 확인, 나머지 미검증**.

### Phase 25 — 실시간 WebSocket 시세 중계 + 백테스트 강화 + 통합 로딩 컴포넌트 (2026-06-07)
그동안 REST 폴링 없이 정적이던 시세를 **업비트 WebSocket 중계로 실시간화**하고, 백테스트에 비교·검증 기능을 보강. ("다음 작업"에 오래 남아 있던 WebSocket 실시간 시세 항목 해소.)
- **실시간 시세 중계 허브**(`main.py:TickerHub` + `/ws/tickers`): 업비트 ticker WS **1개**만 열어 모든 구독 클라이언트에 fan-out(클라이언트마다 업비트 연결을 새로 열면 다중 탭/인스턴스에서 N개로 늘어 비효율 — 캐시 팬아웃 원칙의 WS판). 신규 클라이언트엔 `latest` 스냅샷 즉시 푸시(REST 안 기다리고 화면 채움), 구독자 0이면 업비트 WS 중단, 끊기면 2초 후 자동 재연결. 의존성 `websockets` 추가.
- **프론트 실시간 인프라**: ⑴**외부 store**(`contexts/realtimeStore.js`) — Context로 전체 prices 맵을 구독하면 한 종목만 바뀌어도 모든 셀이 리렌더되므로, `useSyncExternalStore` + **종목별 selector**(`useLivePrice(market)`)로 자기 종목 가격이 바뀔 때만 리렌더. ⑵`RealtimeProvider`(`contexts/Realtime.jsx`) — WS 생명주기만 관리(렌더 없음), 메시지를 300ms 배치로 모아 store 반영(261종 리렌더 폭주 방지). ⑶`components/LiveCells.jsx`(`LivePrice`/`LiveChangeRate`) — WS 값 있으면 그 값, 없으면 REST 폴백 + 변동 순간 빨강/파랑 펄스(`usePulse`, `index.css`의 `flash-up/down` 애니메이션). 적용: 대시보드 시세표·코인목록·코인상세. ⑷헤더 `WsIndicator`(녹색=실시간/회색=오프라인). `App.jsx` Provider를 카트→`RealtimeProvider`로 교체.
- **코인 상세 호가·체결 실시간**(`/ws/market/{market}` + `hooks/useMarketStream.js`): 종목별 on-demand 1연결(공유 허브 불필요), 호가·체결을 WS로 수신해 REST 폴백 위에 덧씌움. 종목 전환 시 재연결·잔상 제거.
- **백테스트 강화**: ⑴**전략 비교**(`/api/backtest/compare`·`run_compare` + `CompareBody`): 한 종목에 MA 크로스·RSI 역추세를 동시에 돌려 자산곡선을 겹쳐 비교. ⑵**워크포워드**(`/api/backtest/walk-forward`·`run_walk_forward` + `WalkForwardBody`): 전체 기간을 N분할해 각 구간 직전 데이터(in-sample)에서 MA 파라미터를 그리드서치로 고르고, 그 다음 구간(out-of-sample)에서만 성과를 집계 — 인샘플 과최적화를 거르는 표준 검증법. 구간별 선택 파라미터·OOS 수익률 표. ⑶**BTC 매수보유 벤치마크**(`_btc_benchmark`): 기존 종목 매수보유에 더해 시장 대표(BTC) 곡선·총수익률을 단일전략·비교에 함께 표기(`EquityPoint.benchmark_btc`·`BacktestMetrics.benchmark_btc_return`).
- **통합 로딩 컴포넌트**(`components/ui/PageLoading.jsx`): 페이지 단위 통짜 로딩 표시를 8개 페이지(대시보드·마켓·코인목록·코인상세·스크리너·섹터·비교·백테스트)에서 공용으로. 요소별 부분 스피너 대신 페이지가 쓰는 데이터가 다 준비될 때까지 본문 자리에 표시(프리페치 덕에 실사용은 대부분 캐시 히트로 빠르게 지나감).

### Phase 26 — 수익률/위험조정 레버 4종 + 신규 기능 묶음 + AI 리포트 + 전면 TypeScript (2026-06-07)
"서비스가 결국 돈을 더 버는 게 목적"이라는 문제의식에서 출발해, **새 알파보다 (a) 잘못된 전략을 안 굴리게 막는 정직화 (b) 같은 신호를 더 잘 사이징하는 리스크 관리**가 실현수익의 핵심임을 정리하고 레버를 구현. 엔지니어링 정비까지 한 묶음.
- **신규 기능(아이디어 비축 소진)**: ⑴**Advance-Decline 라인**(`/api/analysis/advance-decline`, 거래대금 상위 100종 상승−하락 누적 + 동일가중 시장지수 divergence) → 마켓. ⑵**몬테카를로 백테스트**(`/api/backtest/montecarlo`, 과거 일간수익률 부트스트랩 1000경로 → 백분위 부채꼴 + 손실확률) → 백테스트 탭. ⑶**추세추종(TSMOM)** → 백테스트 탭. ⑷**가격 알림**(`contexts/PriceAlerts` + 헤더 🔔, 실시간 WS 감시→토스트, localStorage). ⑸**다크모드**(`@custom-variant dark` + 헤더 🌙 토글·FOUC 방지, 전 페이지 `dark:` variant·차트 테마). ⑹**차트 PNG export**(`utils/chartExport` SVG→PNG)·**비교 공유 링크**(`?markets=` URL 인코딩). ⑺**시스템 모니터링**(`/system` + `core/metrics.py` + `/api/system/metrics`: 캐시 적중률·외부 호출·응답시간·최근 rid). ※ 발견: BTC베타·변동성 z-score·거래량 급증·VWAP/Volume Profile은 이미 구현돼 있었음(작업이력 누락분).
- **수익률 레버**(엔지니어링노트 §38~): ①**TSMOM 고도화**(`run_tsmom`) — 12-1 skip(최근 N일 반전 제외)·**국면/크래시 필터**(시장 약세·고변동 시 익스포저 동적 축소, Daniel·Moskowitz 2016·Moreira·Muir 2017)·변동성 타게팅·턴오버 히스테리시스 → 하락장 MDD 34.8%→11.8%·총 −22%→−2.3%(벤치 −16%). ②**Ledoit-Wolf 수축 공분산**(`sklearn.LedoitWolf`)+**리스크 패리티**(역변동성, mu 추정 비의존) → Markowitz 코너해 완화(`PortfolioResult.risk_parity`·`shrinkage`). ③**Historical VaR/CVaR**(경험분위, GARCH 정규근사의 팻테일 과소평가 보완 — `GarchResult.hist_var_95`·`cvar_95`). ④**유동성 슬리피지**(`_liquidity_slippage_bps`, 거래대금 프록시: BTC 5.7bps/저유동 100bps 상한)·**다중검정 과최적화 p값**(`_overfit_pvalue`, 귀무 하 N시도 최대샤프 분포 대비 → `WalkForwardResult.overfit_pvalue`). 신규 지표 전부 프론트 노출(슬리피지·다중검정 경고·CVaR·▲리스크패리티·수축강도).
- **AI 전략 리포트**(`report_service.py`·`/api/report/strategy`·`ReportModal`): 시장 데이터(프리페치 재사용)를 모아 **Gemini**가 표준 리서치 5섹션 마크다운 생성. **LLM 호출부는 주석 처리**(프롬프트·SDK 코드·데이터 주입 완성, `GEMINI_API_KEY`+주석해제로 동작) — 미연동 시 데이터 기반 자동 초안 반환. **종류별 차등 캐시**(시장 2h / 포트·리스크 6h, LLM 비결정성·비용 차단). 헤더 "AI 리포트" 버튼 → 모달(종류 탭·복사·.md 다운로드).
- **엔지니어링**: ⑴`requirements.txt` 4중복 정리(동일 핀, 257→64줄). ⑵`backend/tests/test_numeric.py` 수치 코어 pytest 9개(MDD·리스크조정·과최적화 p값·피어슨·일간수익률, 9/9 pass — TSMOM 스테이블 버그류 회귀 차단). ⑶**프론트 라우트 코드 스플리팅**(`App` `React.lazy`+`Suspense`): 단일 1.07MB→청크 분리, "500KB 초과" 경고 해소. ⑷**CI**(`.github/workflows/ci.yml`): 백엔드 compileall+pytest / 프론트 lint+typecheck+build. ⑸`cache._revalidate` 예외를 `metrics`로 카운트(조용히 삼키던 SWR 갱신 실패 관측). ⑹**Backtest.jsx 파일 분리**(`pages/backtest/`: parts·helpers + 6개 전략 본문 + 슬림 오케스트레이터). ⑺**전면 TypeScript**: 전 소스 55파일 `.tsx/.ts` 전환 + `tsconfig`(점진 strict:false)·`typescript-eslint`·`vite-env.d.ts`·`typecheck` 스크립트. 컴포넌트 prop 디폴트화로 TS2741 다수 일괄 해소 → **build·lint·`tsc --noEmit` 전부 그린**.
- **정직하게 제외**: async httpx(병목=업비트 레이트리밋이라 실익 음, 동기 전계층 비동기화는 리스크만), Redis·LLM 종목 한줄요약은 나중 작업 보류. (의사결정 엔지니어링노트 참조)
- 검증: 단계마다 백엔드 `compileall`·`pytest 9/9`·라우트 36, 프론트 `build`·`lint`·`tsc` 그린. 신규 기능은 직접 실데이터 호출로 산출 확인. **브라우저 육안 미검증**(서버 재기동 필요).
- 검증: `py_compile`·`vite build`·ESLint 통과, 라우트 27개 + WS 2개. **브라우저 육안 미검증**(실시간 펄스·연결 인디케이터·전략 비교·워크포워드).

### Phase 27 — 운영 견고화: SSL 픽스 + 환경변수화 + 프론트 에러 UX + 테스트 확대 (2026-06-09)
"전체 점검 후 개선점" 요청에서 출발. 배포·다른 PC 이식·실패 시 UX 등 **운영 견고화** 묶음(새 기능 아님).
- **WS SSL 인증서 버그 수정**(맥 발견): 업비트 `wss://` 연결이 `CERTIFICATE_VERIFY_FAILED`로 전부 실패(호가·체결·시세 허브 죽음). 원인 = macOS 프레임워크 Python(3.13)의 기본 CA 번들 `cert.pem`이 프레임워크 site-packages의 certifi를 가리키는 **깨진 심링크**(거기엔 certifi 미설치) → `ssl.create_default_context()`가 CA 0개 로드. REST(httpx)는 자체 certifi라 무사했음. **수정**: `main.py`에 `_SSL_CTX = ssl.create_default_context(cafile=certifi.where())` 만들어 `websockets.connect` 2곳(시세 허브 + 종목별 호가/체결)에 `ssl=_SSL_CTX` 명시. 환경 비의존(맥/윈/리눅스 공통). certifi는 이미 requirements에 핀.
- **환경변수화(배포·이식 가능화)**: ⑴프론트 — `src/config.ts` 신설(`API_BASE`=`VITE_API_BASE`||localhost:8000, `WS_BASE`=`VITE_WS_BASE`||API_BASE의 http→ws 치환). `api/client.ts`(baseURL)·`contexts/Realtime.tsx`·`hooks/useMarketStream.ts`(`ws://...:8000` 하드코딩 제거)가 사용. `vite-env.d.ts`에 env 타입 + `.env.example`. ⑵백엔드 — `config.py`가 `CORS_ORIGINS` 환경변수를 읽음(CSV·JSON 리스트 둘 다, `NoDecode`+`field_validator`. pydantic-settings가 list를 JSON 선파싱하는 걸 `NoDecode`로 끄고 validator가 콤마분리). `main.py`가 하드코딩 대신 `settings.cors_origins` 사용(이전엔 설정만 있고 안 썼음 — 불일치 해소).
- **dev 프리페치 스킵 + /health readiness**: `SKIP_PREFETCH=1`이면 lifespan이 워밍을 건너뜀(dev 리로드마다 1~2분 대기 제거, 첫 요청만 콜드). `/health`가 `{status, ready}` 반환(`ready`=프리페치 완료 플래그, 오케스트레이터 readiness용).
- **프론트 에러 UX(조용한 실패 → 재시도 UI)**: 기존 훅이 `.catch` 없이 실패를 삼켜 빈 화면만 보였음(ErrorBoundary는 렌더 예외만 잡음). 공용 `hooks/useFetch.ts`(파라미터 없는 fetch용, `{data,loading,error,retry}` — loading은 doneNonce 파생이라 effect 안 setState 없음) + 공용 `components/ui/PageError.tsx`(다시 시도 버튼). `useTickers`·`useMarketSummary`·`useAnalysis`(coinStats·category·AD·correlation)·`useCandles`·`useTicker`·`useQuant`(useKeyed) 전부 error/retry 노출. 페이지 7곳(Dashboard·Market·CoinList·Screener·Sectors·Compare·CoinDetail) 로딩 게이트 옆에 에러 게이트 추가. Analysis(퀀트)는 섹션별 Spinner라 에러 시 빈 상태로 안전 degrade(기존 동작 유지).
  - ⚠️ **회귀 1건 자체발생·수정**: `useTickers`를 useFetch로 바꾸며 반환 키가 `{tickers}`→`{data}`로 바뀌어 `PriceAlertMenu`에서 `tickers.map` 크래시(화면 안 뜸) → 훅에서 `{tickers: data, ...}`로 키 보존해 해결. (전 호출부 계약 유지 확인)
- **테스트 확대**: `tests/test_cache.py`(SWR 콜드/신선/stale 갱신/single-flight 3개)·`test_config.py`(CORS CSV·JSON·기본값·SKIP_PREFETCH 5개)·`test_routes.py`(TestClient 비-with로 lifespan 미실행=네트워크0, /health·메트릭·라우트 등록 3개). 기존 9 + 신규 11 = **20 passed**. (pytest는 로컬 venv 미설치였음 — CI만 설치. 로컬 실행 위해 설치)
- 검증: 프론트 `build`·`lint`·`tsc --noEmit` 그린, 백엔드 `py_compile`·`pytest 20/20` 그린, CORS env 3형식 파싱 확인, **WS certifi 핸드셰이크 실연결 성공**(KRW-BTC 시세 수신). **Docker화는 보류(나중 작업)**.

### Phase 28 — 전수 코드 리뷰 후속: 캐시·정밀도·페어 사후검증 (2026-06-09)
"전체 코드 정독 후 개선점" 리뷰에서 나온 항목을 구현(LLM 리포트 실연동·생존편향 Caveat은 사용자가 제외). 의사결정은 엔지니어링노트 §43.
- **coin_stats 캐시 정상화**: `get_coin_stats` TTL을 `TTL_TICKER`(5s)→**`TTL_COIN_STATS`(300s)**. 일봉 파생이라 거의 안 변하는데 5s면 SWR이 261종 루프를 5초마다 백그라운드 재계산(낭비)했음. 추가로 `_compute_coin_stats`가 종목당 일봉을 3번(메인+`_volatility`+`_return_1m`) 받던 걸 1번 받은 데이터로 인라인 계산(`_volatility_from_returns`)하도록 정리(전용 헬퍼 2개 제거).
- **캐시 LRU 상한**: `core/cache.py`에 `_MAX_KEYS=5000` + `_set()`(쓰기 시 `move_to_end`/초과분 `popitem(last=False)` 축출, 축출 키의 single-flight 락도 동반 정리). 읽기는 락-프리 유지, 쓰기만 `_store_lock`. `_store`를 `OrderedDict`로. 포트폴리오 종목 조합 등 파라미터 키의 무한 증가 차단. 테스트 2개 추가(`test_cache` 5개).
- **RNG 시드 결정화**: `quant_service` 포트폴리오 시뮬·`backtest_service` 몬테카를로의 시드를 내장 `hash()`(PYTHONHASHSEED로 프로세스마다 난수화 → 재시작 시 구름·부채꼴이 달라짐)에서 `hashlib.md5` 기반 `_stable_seed`로 → 재현 가능.
- **MA 백테스트 익일(next-bar) 체결**: `run_ma_cross`·`_ma_curve`(워크포워드)가 당일 종가로 크로스를 판정하고 그 종가에 체결하던 동봉 룩어헤드를, **직전 완결봉(i-2→i-1) 크로스 → 당일(i) 종가 체결**로 변경. (RSI는 `rsi_vals[i]`가 직전봉까지만 써 이미 룩어헤드 없음 → 그대로.)
- **페어 사후검증(forward test)**: 공적분 페어 화면이 "현재 z·신호"만 보여주던 것에 **과거 검증**을 추가. `quant_service._pair_backtest`(롤링 z 진입 |z|>2·청산 |z|<0.5, 스프레드 변화를 손익 프록시로 누적) → 각 페어에 `bt_return·bt_trades·bt_winrate`(표 컬럼), 최우수(최저 p값) 페어엔 `best`(스프레드 z + 자산곡선 시계열)로 프론트 `PairBacktestChart`(z 우축+진입선, 자산곡선 좌축). 스키마 `CointPair` 3필드 + `PairBacktestPoint`·`PairBacktestDetail`·`PairsResult.best` 추가. (실데이터: LAYER↔SUI p=0.0003 검증수익 +64% 승률 86%)
- **잡정리**: `report_service`의 미사용 `import os`를 LLM 주석 블록 안으로 이동.
- 검증: 백엔드 `pytest 22/22`·`compileall`, 프론트 `build`·`lint`·`tsc` 그린, 페어 백테스트 실데이터 산출 확인. **브라우저 육안 미검증**(페어 차트·표 신규 컬럼, 서버 재기동 필요).

### Phase 29 — UI/UX 재정리 + 대시보드를 업비트 "코인동향" 미러로 전면 재편 (2026-06-09)
"요소가 흩어져 복잡하다 + 헤더 오른쪽 재정리" 요청으로 시작 → 사용자와 하나씩 결정(D1~). 의사결정·결정 로그는 엔지니어링노트 §44.
- **헤더 재편(그룹 드롭다운 + 우측 아이콘/⋯)**: 평탄 8탭 → **대시보드·둘러보기▾·분석▾·전략▾** 4그룹(`NavGroup` 호버 드롭다운, 하위 라우트 불변). 우측은 텍스트 라벨 제거·아이콘화(🔔🌙✦AI) + **더보기(⋯)**(가이드·도움말·시스템·실시간상태). 로고=코인목록 유지(`/` 불가침). **원칙 확정: 페이지 내 탭/토글로 콘텐츠를 숨기지 않고 다 펼쳐 스크롤**(드롭다운=내비 한정, 백테스트 전략선택만 기능적 예외).
- **대시보드 = 코인동향 PDF 미러**(전면 재작성): 분석 게이지·regime focal·시세표 제거(마켓/분석/코인목록과 중복) → 발견·지수 중심. ⑴자체 시장지수 6카드 + **당일/전일 인트라데이 라인차트**(60분봉) + 주간상승 TOP10 레일 ⑵오늘의 환율 ⑶시황 한 줄 ⑷랭킹 그리드(급상승·급하락·거래량급증·체결강도 매수/매도) ⑸최신 뉴스(페이지네이션) ⑹디지털 자산 표(기간별/시가총액 탭) ⑺디지털 자산 지수 표(시장/전략/테마/섹터 탭+개요+전일·1개월·3개월). PDF의 빨간(불가)으로 봤던 것도 실제 구현 — **환율**(open.er-api)·**뉴스**(한국 RSS)·**시총**(CoinGecko)·**체결강도**(WS `acc_ask/bid_volume`)·**인트라데이**(60분봉). 공식 UBMI만 비공개라 자체 동일가중 대체.
- **신규 백엔드**: `schemas/trends.py`·`services/trends_service.py`(지수·인트라데이·자산지수·체결강도·기간수익·시황)·`fx_service.py`·`news_service.py`·`marketcap_service.py`·`routers/trends.py`(`/api/trends/*` 7개). 프리페치에 trends 3종 워밍 추가(60분봉 팬아웃↑). 외부 실패 시 **"⚠️ 소스 교체 필요" 명시**(숨김 금지, 사용자 요구).
- **마켓**: 상단에 **시장 요약 스트립**(총거래대금·평균등락·52주신고저·집중도·공포탐욕·상승하락 — 대시보드에서 이관) 신설. 중복 게이지(지배력 도넛·breadth 막대)는 대시보드와 함께 제거.
- **섹터·스크리너·분석·전략**: 구조 유지(분석=4페이지 드롭다운, 전략=3페이지, 백테스트 전략선택 기능적 유지).
- **신규 프론트**: `api/trends.ts`·`hooks/useTrends.ts`, Header 재작성, Dashboard 전면 재작성, Market 요약 스트립.
- 검증: 백엔드 `compileall`·`pytest 22/22`·라우트 41, 프론트 `tsc`·`lint`·`build` 그린. 신규 전부 실데이터 산출 확인(인트라데이·자산지수 m3·체결강도 스테이블 제외·시총 156/263). **브라우저 육안은 사용자 검증 예정**(서버 재기동 필수, 60분봉 팬아웃으로 부팅↑ → dev는 `SKIP_PREFETCH=1`).

### Phase 30 — 코드리뷰 후속 + react-query + 헤더 자산운용 톤 + 포트폴리오 완성 + 전역 로딩게이트 + 백테스트 2분리 (2026-06-09)
전수 코드리뷰(개발/UI/퀀트 관점)에서 도출한 개선점을 사용자 승인 항목만 일괄 구현. 의사결정은 엔지니어링노트 §45~.
- **캐시 TTL 미스매치 제거(개발 P1)**: 월봉/주봉이 분봉과 같은 `TTL_CANDLE=30s`였는데 이를 소비하는 집계(기간수익률 300·섹터 월봉 1800)가 재검증마다 261종 월봉을 콜드로 다시 받던 숨은 팬아웃 → `TTL_CANDLE_LONG=1800` + canonical(월봉 61·주봉 200) 1회 fetch·슬라이스 공유로 통일(`candle_service`·`config`). 분봉만 30s 유지(라이브).
- **페어 백테스트 룩어헤드 제거(퀀트 P1)**: 헤지비율 β를 전 구간 OLS로 적합하던 것을 **형성기간(앞 50%)에서만 추정 → 거래기간(뒤 50%)만 매매**하는 out-of-sample로(`_pair_backtest(trade_start)`·`_PAIR_FORMATION`). 공적분 검정은 선정용이라 전 구간 유지. `PairBacktestDetail.formation_end`로 프론트가 경계선 표시.
- **횡단면 모멘텀 롱온리 토글(퀀트 P1)**: 달러중립 롱숏(공매도 가정 — 업비트 현물 실행 불가)에 더해 **상위분위 매수만(현물 실행 가능)** `long_only` 파라미터 추가(`/api/quant/momentum`·`MomentumResult.long_only`). 프론트 모멘텀 섹션에 롱숏↔롱온리 토글.
- **로그 이중출력 제거(개발 P2)**: uvicorn 로거가 자체 핸들러+root 전파로 같은 줄 2번 찍히던 것을 `setup_logging`에서 uvicorn 로거 핸들러 비우고 root 단일 포맷으로(8001 기동 로그로 확인).
- **`/ws/market/{market}` 입력검증**: 미상장 종목은 업스트림 전달 전 `valid_markets()` 화이트리스트로 거부(close 1008).
- **테스트**: `tests/test_quant_units.py`(페어 OOS 불변식·월봉/주봉 canonical 공유) 4개 → pytest 22→26.
- **react-query 도입(개발 P1)**: 공용 훅(useFetch·useTickers·useTrends·useAnalysis·useCandles·useQuant)을 `useQuery` 백킹으로 — **동일 queryKey 디둡**(대시보드 usePeriodReturns 2회 호출 등 중복 제거)·**페이지 재방문 시 staleTime(60s) 내 캐시 즉시 렌더**. `placeholderData`로 첫 로드만 loading=true. `main.tsx` QueryClientProvider.
- **다크모드 차트 즉시반영**: lightweight-charts가 마운트 시점 테마만 읽던 것을 `MutationObserver`(html.dark)로 `applyOptions` 재적용(메인·RSI 차트). + 뉴스 index-key→url.
- **헤더 자산운용 톤 재명명**: 시황·마켓·리서치·전략(증권사/운용사 리서치 용어). 종목 비교 → 리서치 그룹(고른 종목 분석), 스크리너는 마켓 유지(전체 발굴). 메뉴 글씨/간격 키움. 푸터·가이드 정합. (Help는 사용자가 나중 일괄 — 본 세션 막판 수정 중단)
- **포트폴리오 최적화 페이지 완성(요청)**: 카드 하나뿐이라 짧던 것을 — ①상관행렬 히트맵(분산효과 근원, 공분산에서 직접) ②CAL(자본배분선)+접점 ③목표수익률 슬라이더(경계선 위 이동→비중 확인, `FrontierPoint.weights`) ④비중 카드에 리스크 기여도 막대(`PortfolioSpot.risk_contrib`)+분산효과 비율(`diversification`) ⑤개별 자산 통계 표(`AssetPoint.sharpe`). 전부 이미 구한 공분산 재사용(팬아웃 0).
- **전역 로딩/에러 게이트**: 표시형 페이지(시황·마켓·섹터·스크리너·리서치)는 쓰는 모든 훅을 모아 하나라도 로딩→`PageLoading`/하드에러→`PageError`(헤더·푸터 외 비노출). `Analysis`를 경로별 Body 컴포넌트로 리팩터(활성 그룹 훅만 게이트, `PAGE_META` 제거). 상호작용형/master-detail은 초기만 게이트.
- **백테스트 2분리**: 7종이 목적상 이질적(전략 실행 vs 검증) → `/tools/backtest`(전략 실행: MA·RSI·추세추종·포트폴리오 보유) + `/tools/validation`(검증·시뮬: 전략비교·워크포워드·몬테카를로) 신설. 헤더 그룹명 포트폴리오→**전략**.
- **상관 네트워크 여백**: 캔버스 흰 여백 축소 + `preserveAspectRatio="xMidYMid meet"`(찌그러짐 방지). (이후 사용자가 화면 보고 추가 미세조정)
- 검증: 백엔드 `pytest 26/26`·`compileall`, 프론트 `tsc`·`lint`·`build` 그린. **WS 실시간 갱신 end-to-end 검증**(8001 임시서버, `/ws/tickers`·`/ws/market`·미상장 거부 3종 통과). 포트폴리오 신규 필드 실데이터 산출 확인.

### Phase 31 — 전수 리뷰(개발/디자인/PM/퀀트) 후속: 퀀트 정확성·인증·실행연결·정직표기 (2026-06-10)
4관점 전수 리뷰에서 도출한 항목을 사용자 승인분만 일괄 구현. 의사결정은 엔지니어링노트.
- **퀀트 정확성 수정**: ⑴**Q1 상관 = 일간 수익률 기반**(`analysis_service.get_correlation`이 종가 '레벨'끼리 피어슨을 구해 허위상관이 났던 것 → `_daily_returns`로 수정, quant network/PCA와 통일) ⑵**Q5 RSI Wilder 평활**(매 봉 단순평균 → 첫 period 시드+α=1/period 지수평활, 백엔드 `_rsi`·프론트 `calcRSI` 동일) ⑶**Q2 공적분 페어 BH-FDR 다중검정 보정**(수백 페어를 α=0.05로 개별검정하면 우연 발견 다수 → Benjamini-Hochberg 임계, `CointPair.fdr_pass`·`PairsResult.found_fdr` 표기) ⑷**Q3 페어 검증수익 = 실제 2-leg PnL**(로그스프레드 변화 프록시 → (자산1−β·자산2) 달러중립 일간수익, 거래비용, `_pair_backtest(p1,p2,spread,beta,...)`) ⑸**Q6 단일전략 변동성 타게팅 사이징**(올인/올아웃 토이 보완 — 진입 시 직전20일 실현변동성으로 비중 축소, `target_vol` 파라미터·`avg_position` 노출) ⑹**Q8 도미넌스 = 시총 기준**(거래대금 비중 → CoinGecko `/global` `market_cap_percentage.btc`, 실패 시 거래대금 폴백, 라벨로 출처 명시) ⑺**Q9 공포·탐욕 = 실제 F&G**(자체 breadth 휴리스틱 → alternative.me 연동, 실패 시 자체 폴백 '자체' 표식, `fng_service.py`) ⑻**Q10 체결강도 '당일 누적' 라벨**(순간압력 아님 명시).
- **보안/인증(가장 강하게)**: `core/security.py`(PyJWT HS256 + bcrypt) + `core/ratelimit.py`(IP 토큰버킷 전역 레이트리밋 + 로그인 brute-force 잠금) + `routers/auth.py`(`/api/auth/login·token·refresh·logout·me`). **JWT를 HttpOnly·Secure·SameSite=Strict 쿠키**로 보관(localStorage 미사용), access(30분)+refresh(7일). **전 데이터 라우터에 `Depends(current_user)` 일괄 가드**(/health만 예외), **보안 헤더**(nosniff·DENY·Referrer·HSTS), **WS도 인증**(처음엔 쿠키, 이후 브라우저 WS 쿠키 미전송 우회 위해 **단기 ws 티켓** `/api/auth/ws-ticket`+`?token=`으로 전환). 프론트 `contexts/Auth.tsx`+`useAuth.ts`·`pages/Login.tsx`·`App.tsx` `RequireAuth`/`ProtectedShell` 가드·axios `withCredentials`+401 자동 refresh.
- **실행 연결(actionability)**: `services/signal_service.py`+`routers/signals.py`(`/api/signals`) — 모멘텀 롱·페어 z>2·국면 전환·52주 돌파/급등을 합성(기존 캐시 재사용, 팬아웃0). 프론트 `components/SignalsPanel.tsx`(대시보드)·코인상세 시그널 배지. **CSV export**(`utils/csv.ts`, BOM+이스케이프) — 기간표·스크리너.
- **관측성**: `metrics.record_source` + `/system` **외부 소스 헬스**(환율·뉴스·시총·F&G·체결강도 WS 마지막 성공/실패 시각·정상여부).
- **신뢰성/정직표기**: 통합 `components/Caveat.tsx`(회색 한 줄, amber 박스 지양) — 백테스트·모멘텀·페어·포트폴리오·리스크에 인샘플·생존편향·거래비용·rf=0 명시(SurvivorshipNote 흡수).
- **인프라**: 콜드 캐시 경로 single-flight, `get_tickers` 조립 결과 캐시화, 캐시 LRU 읽기-터치+상한 20k.
- **UX**: 스크리너 결과에 '거른 기준 컬럼' 동적 노출(BTC베타·거래량급증·변동성z), 대시보드 외부소스를 전역 게이트에서 분리(인라인 degrade) — 이후 Phase 32에서 정책 재정의.
- **테스트/CI**: 백엔드 `test_improvements.py`(RSI·사이징·FDR·2-leg·JWT·레이트리밋·F&G·뉴스/FX 파서) → **pytest 26→43**, 프론트 **vitest 도입**(format·csv·PageError·Login = 9), CI에 vitest 단계. requirements `bcrypt`·`PyJWT`, package `vitest`·`jsdom`·`@testing-library/*`.
- 검증: 백엔드 `pytest 43`·`compileall`, 프론트 `tsc`·`lint`·`build`·`vitest 9` 그린. 인증 스모크(미인증 401·로그인·me·ws-ticket decode) 통과.

### Phase 32 — 성능(스로틀 우선·TTL·워머)·react-query·'/' 전면 실시간·로그인 재디자인 (2026-06-10)
"페이지 이동 시 가끔 부팅 데이터 로드를 다시 해 느리다"의 원인 진단 → 전역 업비트 스로틀을 백그라운드 팬아웃이 점유해 포그라운드가 줄 서던 것 + 인메모리 캐시의 콜드. 사용자와 정책을 합의해 일괄 개선.
- **성능**: ⑴**포그라운드 우선 스로틀**(`upbit_rest`: 백그라운드 호출(스레드명 `cache-revalidate`/`periodic-warm`)을 `_bg_lock`으로 직렬화+포그라운드 대기 시 양보, 사용자 요청은 다음 슬롯만 대기) ⑵**일봉 TTL 600s→1시간**·**60분봉 30s→5분**(`TTL_CANDLE_INTRADAY`)·**스파크라인 전 종목 프리페치+TTL 30분**(`_SPARK_LIMIT` 제거) ⑶**주기 워머 분산**(240s를 7그룹 staggered)+외부소스도 부팅 프리페치 포함 ⑷**캐시 LRU 읽기-터치**(핫 키 축출 방지)+상한 20k ⑸**외부소스 게이팅**: callable TTL로 **에러 60초 캐시**(죽은 소스 재-매달림 방지)+httpx 타임아웃 4초, 프론트는 게이트에 포함(워밍 후 캐시히트, 죽으면 SourceError).
- **react-query**: `keepPreviousData`(코인/인터벌 전환 시 옛 화면 유지)·`gcTime 1시간`(재방문 즉시)·`staleTime 5분`.
- **'/' 전 요소 실시간화**(실시간 의미 있는 것 전부): 우측 리스트 **거래대금·실시간 재정렬·필터 카운트**(`useLiveTickers`+store 전역 버전), 코인상세 **52주 위치·1개월 수익률·시장 점유율·거래대금 순위**(현재가/거래대금 종속분 라이브 계산), **캔들차트 실시간 슬라이딩**(WS 틱으로 형성 봉 갱신+새 버킷 시 우측 새 봉 생성·좌측 밀림). 변동성·GARCH·베타·상관 등 실시간 의미 없는 것만 정적. WS 끊김 원인=인증 가드 → **ws 티켓**으로 복구.
- **'/' 요소 추가**: 경량 SVG 스파크라인(전 행, recharts 아님), 코인상세 시그널 배지, **최근 본 코인 왼쪽 플로팅 패널**(최근 6개, `xl:` 이상).
- **헤더**: 메뉴 영역 width 통일(min-w-96 중앙정렬).
- **로그인 재디자인**: `/login` 진입 시 세션 wipe, **plain 다크 그라데이션 배경**(차트 이미지 후보들 비교 후 사용자 plain 선택), **큰 로고 인트로**(scale 2.8→1 settle)+쉬머, **배경에 녹는 언더라인 인라인 폼**(흰 밑줄·흰 글씨), **비밀번호 눈 토글**, 문구 "암호화폐 퀀트 분석 대시보드", 로그아웃 헤더 ⋯. (로그인 차트 캡처용 Playwright는 작업 후 미사용이라 제거.)
- 검증: 백엔드 `pytest 43`·`compileall`, 프론트 `tsc`·`lint`·`build`·`vitest 9` 그린. 캐시 읽기-터치 회귀 테스트 추가.

### Phase 33 — 라우트 IA 일관화 + AI 리포트 Gemini 실연동 + 시황/최적화 레이아웃 + 가이드 실캡처 + 헤더/팝업 + TS strict 전면 (2026-06-11)
긴 세션. 사용자 요청·질문 핑퐁으로 다수 개선. 의사결정·디버깅은 엔지니어링노트.
- **헤더 드롭다운**: 호버가 살짝만 벗어나도 닫히던 것 → 좌/우 드롭다운 통일(`mt-0`·`w-52`·`rounded-b-lg`) + 메뉴 위 **투명 브릿지**(`before:content-[''] before:bottom-full before:-inset-x-2`)로 호버 판정 영역 확대(지연 아닌 영역 확대). **팝업 중앙정렬**: `utils/popup.ts`(`openCenteredWindow`, 현재 창 기준 중앙) — 가이드·도움말(Header·Footer 공용).
- **라우트 `/그룹/페이지` 일관화**(사용자 요구): 드롭다운 그룹명 = 경로 prefix. **마켓→`/market/{overview,sectors,screener}` · 리서치→`/research/{structure,regime,factor,risk,compare}` · 전략→`/strategy/{portfolio,backtest,validation}`**. 시황→**"시장 동향"**(증권 톤, 사용자 선택)+`/trends`. 기존 평탄/옛 경로(`/market`·`/sectors`·`/structure`·`/tools/*`·`/dashboard`·`/overview`·`/compare`·`/backtest`·`/analysis/*`·`/quant` 등) **전부 리다이렉트 호환**. Explore/Analysis 경로분기·Header NAV match·Footer·Guide·Help·CoinDetail/Market/Sectors/Dashboard 크로스링크·백엔드 `signal_service` action(`/regime`→`/research/regime`, `/factor`→`/research/factor`) 정합.
- **백테스트·검증 드롭다운 IA**(사용자 제안 수용 — 처음엔 헤더 비대 우려했으나 4·3개면 적정이라 수긍): 전략 단일 드롭다운 → **최적화(단일 링크) · 백테스트▾(MA·RSI·추세추종·포트폴리오) · 검증▾(전략비교·워크포워드·몬테카를로)**. `/strategy/backtest/:strategy`·`/strategy/validation/:method`(딥링크 가능), `key`로 리마운트(전략 전환 시 상태·자동실행 초기화). **페이지 내부 전략탭 제거**(헤더 드롭다운이 곧 선택자).
- **AI 리포트 Gemini 실연동**(사용자가 키 제공): `config.py` `.env` 로딩(`SettingsConfigDict(env_file=".env")`)+`gemini_api_key`, `report_service` **부문별 전용 프롬프트**(시장/포트폴리오/리스크 각 초점+정확한 마크다운 섹션 구조 지정)로 LLM 응답을 그대로 렌더. **stub/자동초안 제거 — 키 미설정·실패·빈 응답이면 RuntimeError→라우터 502로 오류 전파**(숨기지 않음), 실패는 캐시 안 함(성공만 종류별 장기 캐시 7200/21600s). `google-genai==2.8.0`, **`backend/.env`(gitignore — 키 절대 커밋 X)**. 프론트 `ReportModal`: 종류 탭 제거·**세 리포트(시장·포트·리스크)를 한 스크롤에**·**실제 PDF 생성**(`jspdf`+`html2canvas-pro` 동적 import로 코드분할, 모달 본문 캡처·`onclone`으로 다크 제거해 흰 배경·다중페이지 슬라이스). 라이브 호출(키 로드+모델 응답) 검증.
- **시황(시장 동향) 레이아웃**: 오늘의 시황 + 최신 뉴스를 **최상단**으로, 뉴스 `NEWS_PER` 4→8, 옆 '· 외부 소스' 텍스트 제거.
- **최적화(PortfolioSection) 레이아웃**: 자산 간 상관행렬을 **좌측 2/3·목표수익률 슬라이더 바로 아래**(넓게, "위로 닿게"), 개별 종목 통계를 **우측 1/3·비중카드 아래**(좁게=백테스트 표 폭). 기존 하단 2열 그리드 해체.
- **가이드 실 스크린샷**(사용자: "앱 띄워 네가 캡처해 첨부"): Playwright(`scripts/capture-guide.mjs`, devDep)로 `test/test` 자동 로그인 → 8개 분석 화면 캡처(network·cluster·pca·regime·momentum·pairs·markowitz·garch) → `public/guide/*.png`, `Guide.tsx`의 점선 placeholder를 실제 이미지(클릭 시 원본)로 교체. 도움말 내용도 Phase 31~32 반영(로그인·헤더 우측 도구·시그널·CSV·최근 본 코인).
- **TS strict 전면 활성화**: `tsconfig strict:true`(noImplicitAny·strictNullChecks 포함 전 플래그). 절차 — ⑴noImplicitAny 539→0(TS 컴파일러 API 코드모드로 파라미터·구조분해·변수 `: any` 자동 주입 + 인덱스맵 `Record`·recharts formatter·d3-force 모듈선언 수동), ⑵strictNullChecks 172→0(`useState/useRef`·`const []` 좁은 타입 제네릭화 코드모드 + 컨텍스트·차트 ref 수동), ⑶나머지 strict 플래그 추가 0. **그 뒤 "진짜 타입"**: `src/types.ts`(백엔드 8스키마 거울, ~50 도메인 인터페이스) + api/ 실제 반환 타입 + `useFetch` 제네릭으로 hooks 전파(`useTickers()`=`Ticker[]` 등) + 전 컴포넌트 props·헬퍼를 도메인 타입으로 + 내부 콜백 실타입 추론. `any` 449→226(남은 건 recharts/lightweight-charts 경계·스키마 없는 클라 형태로 **의도적 잔존** — 더 좁히면 한계효용 낮음, 엔지니어링노트).
- **서버 고아 프로세스 진단**(사용자 보고: kill-port 8000 해도 업비트 로그 간헐 발생): `fastapi dev`(uvicorn `--reload`)의 worker 자식(Windows `multiprocessing.spawn`)이 **고아로 살아남아 포트 바인딩만 잃으면** 8000엔 아무것도 없는데 앱이 살아 `_periodic_warm` 데몬이 업비트를 침 → kill-port가 못 잡음. 해당 PID 직접 종료로 해결. 권장: 터미널 Ctrl+C / `Get-Process python|Stop-Process` / reload 없이 uvicorn / `SKIP_PREFETCH=1`.
- 검증: 프론트 `tsc(strict)`·`eslint`·`build`·`vitest 9` 그린, 백엔드 `compileall`·`pytest 43` 그린. **브라우저 육안은 사용자.** 일회성 코드모드 스크립트는 정리(capture-guide.mjs만 보존).

### Phase 34 — 브라우저 검증 후속 UI/버그 묶음 + 체결강도 hang 수정 (2026-06-11)
사용자가 Phase 33 결과를 브라우저로 보며 제시한 수정 묶음(12건). 의사결정·디버깅은 엔지니어링노트.
- **체결강도 빈 데이터 = 무한 행(hang) 버그**: `trends_service._ws_collect`의 종료 조건이 "전 종목(263) 수집"뿐이라, 일부 종목은 `acc_ask_volume==0`이라 영영 `out`에 안 들어가고 + 시장이 활발해 메시지가 2초 내 계속 들어오면 recv 2s 타임아웃 break도 안 걸려 **무한 수집 → 요청이 끝나지 않음**(프론트 '불러오는 중' 고정). **전체 수집 4초 deadline**(`asyncio.get_event_loop().time()`) 추가로 해결. 격리 테스트로 무한대→4초 내 262종 반환 확인(초기 스냅샷은 첫 ~1초 버스트에 대부분 도착). ⚠️ 이 hang이 **세션 중 내 콜드 진단 스크립트 2개를 안 끝나게** 했고, 그게 kill-port 후에도 업비트 로그가 간헐 발생한 진범이었음(서버 트리와 함께 PID 직접 종료).
- **시장 동향 레이아웃 재배치**: 본문을 2-컬럼으로 — 좌(2/3, 시장지수 폭)에 **시장지수·환율·실행 시그널** 스택, 우 레일(1/3)에 **주간 상승 TOP10 + 랭킹(급상승·급하락·거래량급증·체결강도 매수/매도) 세로 스택**. RankingGrid를 3-col grid→`space-y-4` 단일 컬럼으로, TOP10과 겹치던 '주간 상승' 셀 제거.
- **라우트 이동 시 스크롤 최상단 초기화**: `App.tsx`에 `ScrollToTop`(`useLocation` pathname 변경 시 `window.scrollTo(0,0)`) — SPA가 스크롤 위치를 유지하던 것 차단.
- **검증 = 단일 페이지 통합**(드롭다운 해제): 3기법(전략비교·워크포워드·몬테카를로)은 내용이 짧아 한 페이지에 세로로 모음. `Validation.tsx` 재작성(섹션 헤더+기법별 독립 종목 state), 헤더 NAV `검증`을 단일 링크로, `/strategy/validation/:method`→`/strategy/validation` 리다이렉트. 백테스트(4전략)만 드롭다운 유지.
- **검증 일괄 단일 로딩 게이트**(사용자 재지적 — 요소별 분할 스피너 금지 원칙 위반): 세 바디가 마운트 자동실행하며 각자 내부 `PageLoading`을 띄워 3개로 쪼개진 것 → 각 바디에 `onReady?` 콜백 추가(run이 promise 반환, 마운트 effect `.finally(onReady)`), `Validation`이 셋 다 준비될 때까지 본문을 `hidden`으로 숨기고 **단일 `PageLoading`만** 노출. 메모리 [[feedback-unified-loading-gate]]에 박음.
- **최적화 상관행렬 확대**: 좌측 칼럼 `flex flex-col` + 상관행렬 컨테이너 `flex-1 flex flex-col`로 우측(개별 종목 통계) 바닥까지 높이 채우고 남는 공간에 세로 중앙정렬. `CorrMatrix` 셀 38×26→**54×40**, 폰트 11→12px, 셀 경계선 추가.
- **백테스트 실행 버튼 문구 통일**: '백테스트 실행'·'재실행'·'재시뮬레이션' 제각각 → **'실행'**으로 통일(SingleStrategyBody·TsmomBody·PortfolioBacktest, 로딩 '실행 중…'). 검증의 method별 버튼('비교 실행' 등)은 한 페이지에 셋이 공존해 구분 위해 유지.
- **AI 리포트 스피너·짤림**: ⑴부문별 개별 스피너 → 셋 다 끝날 때까지 공용 `PageLoading` **하나로**(문구도 일반 페이지와 통일). ⑵리포트 내용이 중간에 잘리던 것 = `gemini-2.5-flash`의 **thinking 토큰이 `max_output_tokens` 예산을 잠식** → `thinking_config=ThinkingConfig(thinking_budget=0)` + `max_output_tokens 2048→4096`(리포트는 추론보다 형식 준수가 핵심).
- **PDF 진짜 여백**: 단일 이미지를 페이지에 0여백으로 깔던 것 → 원본 캔버스를 페이지 콘텐츠 높이로 **슬라이스**해 각 면에 **14mm 균일 여백**으로 배치(4면 깔끔).
- **더보기(⋯) 드롭다운 헤더 침범**: NavGroup 컨테이너는 `relative flex h-full`(60px)이라 `top-full`이 헤더 하단에 닿는데, MoreMenu는 `items-center`(높이=아이콘)라 `top-full`이 헤더 중간에서 시작 → 침범. 우측 컨테이너+MoreMenu div에 **`h-full`** 부여로 NavGroup과 동일하게 헤더 아래에서 열리게.
- **최근 본 코인 패널 위치·짤림**: 뷰포트 끝(`fixed left-3`) → **본문(중앙 max-w-1440) 왼쪽 거터에 `right` 앵커**(`min(calc(100% - 3.5rem), calc(50% + 720px + 0.5rem))`, 거터 좁으면 화면 안 폴백)로 붙임. 버튼 `w-12`→**`w-16` 고정폭 + `truncate`**(긴 심볼은 …). '최근 본' 라벨도 `w-16 text-center`로 중앙정렬.
- **드롭다운 페이지 브레드크럼**: 드롭다운으로 진입한 페이지는 헤더만으론 현재 위치를 알기 어려워(드롭다운 닫히면 안 보임) → `Layout`에 **`그룹 › 페이지` 브레드크럼**(마켓·리서치·백테스트 하위 경로만, `CRUMB` 맵). 단일 링크(시장동향·최적화·검증·코인목록)는 제외. 로딩 게이트와 무관하게 본문 최상단 유지.
- **종목 비교 리서치→마켓 이동**: 종목 비교는 전 종목 구조 분석(리서치)과 달리 **고른 후보를 겹쳐 보는 '탐색'** 성격이라 마켓 그룹으로. `/그룹/페이지` 규칙대로 라우트도 `/research/compare`→**`/market/compare`**(옛 경로·`/compare`·`/tools/compare`는 리다이렉트). Header·Footer·Layout 브레드크럼·Help·문서 정합.
- 검증: 프론트 `tsc(strict)`·`eslint`·`build` 그린, 백엔드 `compileall`·`pytest 43` 그린. **브라우저 육안은 사용자**(서버 재기동 필요 — AI 리포트·체결강도).

### Phase 35 — 브라우저 검증 2차: 시장 동향 레이아웃 정밀화 + 환율 추이차트 + 헤더 관점구분선/AI 전략 + 외부소스 보강 (2026-06-11)
Phase 34에 이어 사용자가 화면 보며 핑퐁한 UI 정밀 수정 + 외부소스 견고화 묶음. 주로 시장 동향(대시보드).
- **환율 = 추이 라인차트(외부소스 추가)**: 기존 open.er-api는 현재가만 줘서 그래프 불가 → **`api.frankfurter.dev/v1`**(ECB 일별·무인증, frankfurter.app은 301 폐기)에서 최근 ~32영업일 KRW/단위 시계열 + 날짜를 백엔드 프록시·6h 캐시(`fx_service._fetch_spark`, 실패해도 현재가는 유지). 스키마 `FxRate.spark`·`FxResult.spark_dates`. 프론트는 **통화별 세로 스택**(미국→일본·100→중국→유로), 각 통화 **X축(날짜)·Y축(KRW) 있는 150px 라인차트**(그리드·호버 툴팁 원화값). 색은 시장지수(빨강)와 안 겹치게 **보라(`#8b5cf6`) 단색**. 전일대비 줄·'외부 소스' 텍스트 제거.
- **뉴스 소스 교체 + 견고화**: 로그 에러(`not well-formed line 23`)는 **코인데스크코리아 RSS가 폐기돼 HTML 페이지 반환**이 원인 → **블록체인투데이**(`blockchaintoday.co.kr/rss`, 유효 RSS 50개)로 교체. `_parse_feed`에 **HTML 응답 가드**(폐기 피드는 ParseError 대신 "RSS 아닌 HTML"로 깔끔히 스킵) + **bare `&`/제어문자 새니타이즈** 후 재시도.
- **시장 동향 레이아웃 정밀화**: ⑴시장지수 카드 그래프 — width가 짧던 것(X도메인 `[0,24]` 고정→`['dataMin','dataMax']`로 가로 꽉) + 높이 ↑(h-12→h-20) + **호버 툴팁**(시각·등락률). ⑵우측 레일을 **`flex flex-col gap-4 justify-between`**으로(+band 그리드 `items-start` 제거해 두 컬럼 stretch, RankingGrid를 fragment로) → TOP10+랭킹 카드가 컬럼 높이에 맞춰 **균등 분배**, 최하단이 좌측 시그널 바닥에 정렬. ⑶**실행 가능한 시그널 고정 12칸 + 회색 채움**(`SLOTS=12`, 적으면 회색 빈 칸·많으면 캡) — 좌측 높이 안정화. ⑷**체결강도 부팅 프리페치 추가**(첫 진입 빈 영역 제거, 게이트가 캐시 히트로 통과). ⑸오늘의 시황 날짜 우측 끝, 자산지수 탭 컬럼 `table-fixed` 고정, 스크리너 결과 스크롤(`max-h-780`+sticky). ⑹환율/시그널을 시장지수 폭(좌 2/3)으로.
- **리서치 정렬 정리**: 모멘텀 롱/숏 폭 축소(max-w)+가운데, 시장국면 약세/강세 카드 가운데, 페어/리스크 표 `table-fixed`(우측 열 균일), **팩터 최상위 요약(FactorSummary) 제거**(아래 모멘텀/페어 섹션과 중복 — GroupView `Summary` 옵셔널화). Caveat 공통 위 간격(`mt-5`+상단 구분선).
- **헤더 관점 구분선 + AI 전략 텍스트화**: 평탄 나열을 **분석(시장동향·마켓·리서치)│실행(최적화·백테스트·검증)** 단일 구분선으로 관점 표기(처음 4관점 3선 검토 후 사용자가 1선 채택). **AI 아이콘 → "AI 전략 βeta"**(βeta=그리스 β+eta 이탤릭 뱃지) 텍스트로, **검증 옆 `|` 우측**으로 이동(리포트 모달 제목도 동일). **더보기 ⋯ → "더보기" 텍스트+chevron**. **활성 탭 밑줄 제거**(흰 글씨·볼드만), 드롭다운 화살표 라벨 오른쪽 absolute(라벨만 중앙정렬). 푸터를 헤더 IA에 맞춰 재구성(마켓 드롭다운 항목만, 시장동향·코인목록은 별도).
- **마감 디테일(사용자 핑퐁)**: ⑴**검증 라벨 헤더/푸터 통일**("검증" — 페이지는 검증+시뮬레이션 겸하나 내비는 다른 탭과 길이 맞춰 축약). ⑵**푸터 정합**: 시장 동향·코인 목록(헤더 단독 진입점)을 브랜드 영역 바로가기로, 안내 컬럼은 도움말·분석 가이드·시스템 모니터링·업비트 Open API 순. ⑶**헤더 더보기** 순서 도움말→분석 가이드. ⑷**AI 전략 모달 βeta 뱃지**를 헤더 톤(`bg-white/15` 결과색 `#2e5499`, 네이비보다 옅은 파랑·흰 이탤릭)으로 통일 + **Gemini 뱃지 제거**. ⑸**최근 본 코인 패널** 세로 중앙(`top-1/2`)→**`top-28`**(본문 최상단 지표 높이). ⑹**AI 리포트 503 재시도**(2.5-flash 3회 백오프 — 2.0-flash 폴백은 무료티어 429라 제거, 서버 과부하만 재시도).
- 검증: 프론트 `tsc(strict)`·`eslint`·`build` 그린, 백엔드 `compileall`·`pytest 43` 그린, frankfurter/뉴스/체결강도/Gemini 격리 호출로 실데이터 확인. **브라우저 육안은 사용자**(서버 재기동 — 환율 차트·뉴스·체결강도·AI 리포트). 대량 백엔드 수정이라 dev는 `SKIP_PREFETCH=1` 권장(reload 재프리페치 회피).
