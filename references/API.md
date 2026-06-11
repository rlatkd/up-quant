# UPquant API 명세서

UPquant 백엔드(FastAPI) REST API 명세입니다. 응답은 **업비트 Open API(시세, 인증 불필요)** 를 호출해 생성하며, 인메모리 TTL 캐시(stale-while-revalidate)로 제공됩니다. (카테고리 분류는 업비트 데이터랩 '코인 분류'를 1회 스크랩한 정적 스냅샷, 수익률은 실 월봉 집계)

- **Base URL**: 로컬 `http://localhost:8000` · **운영 `https://api.skku.site`**(EC2·nginx·TLS). 프론트는 `VITE_API_BASE`로 주입.
- **자동 생성 문서** (서버 실행 중일 때):
  - Swagger UI: <http://localhost:8000/docs>
  - ReDoc: <http://localhost:8000/redoc>
  - OpenAPI JSON: <http://localhost:8000/openapi.json>
- **인증**: 없음
- **CORS**: 기본 `http://localhost:5173`(프론트엔드). 배포 시 `CORS_ORIGINS` 환경변수(콤마 구분 또는 JSON 리스트)로 덮어씀
- **응답 헤더**: 모든 응답에 추적용 `X-Request-Id`(rid) 포함 — 프론트·백엔드·업비트 로그가 같은 rid로 묶임
- **캐싱/레이트리밋**: 업비트 시세 호출은 전역 스로틀(~초당 8회) + 429 재시도로 보호되며, 결과는 TTL 캐시(ticker 5s · candle 30s · market_all 1h 등). 첫 호출(콜드)만 다소 느리고 이후·만료 시에도 즉시 응답.

---

## 공통 사항

### 인증 (Phase 31)
**모든 `/api/*` 데이터 엔드포인트와 `/ws/*`는 로그인(JWT)을 요구**합니다. `/health`와 `/api/auth/*`만 공개.
- `POST /api/auth/login`(또는 `/token`, form: `username`/`password`) → 성공 시 **access/refresh JWT를 HttpOnly·Secure·SameSite=Strict 쿠키**로 설정. 본문은 `{username}`.
- `POST /api/auth/refresh` → refresh 쿠키로 새 access 쿠키. `POST /api/auth/logout` → 쿠키 삭제. `GET /api/auth/me` → `{username}`(미인증 401).
- `GET /api/auth/ws-ticket` → `{ticket}`(60초 단기 토큰). WS는 브라우저가 핸드셰이크 쿠키를 안 보낼 수 있어 이 티켓을 `?token=`으로 붙인다.
- 계정은 하드코딩 `test/test`(과제용, env로 변경). 미인증 시 `401`. 로그인 실패 누적·요청 폭주는 레이트리밋(429).

### 지원 마켓 (분석 유니버스 ~261종)
분석 유니버스는 **업비트 KRW 마켓 전체(~261종)** — `config.USE_ALL_KRW_MARKETS`. 부팅 시 `/v1/market/all`과 교집합만 사용(상장폐지 종목 자동 제외. 예: KRW-MATIC은 POL 마이그레이션으로 폐지 → KRW-POL).

### 코인 분류 (섹터)
코인↔섹터 매핑은 **업비트 데이터랩 '코인 분류'**(`datalab.upbit.com/sector`)를 1회 스크랩한 정적 스냅샷(`app/data/upbit_sectors.json`). 261종 전체에 3단계 분류(level1/2/3)가 있으며, 화면은 **대분류(level1) 5종**을 사용합니다(종목 수 순):
```
스마트 컨트랙트 플랫폼(86)  인프라(80)  디파이(50)  문화/엔터테인먼트(34)  밈(11)
```
`config.MARKET_CATEGORIES`(market→level1) · `CATEGORY_LIST` · `MARKET_SUBCATEGORIES`로 노출. 스냅샷이라 신규 상장 종목은 미분류(`null`)일 수 있습니다.

### 오류 응답
| 상태 코드 | 의미 | 본문 예시 |
|-----------|------|-----------|
| `404` | 존재하지 않는 마켓 | `{ "detail": "Market not found" }` |
| `422` | 쿼리 파라미터 검증 실패 (범위 초과 등) | FastAPI 기본 검증 오류 형식 |

### 시간 단위
- 캔들 `timestamp`: **Unix 밀리초(ms)**
- 체결 `Trade.timestamp` · 백테스트 `time`: **Unix 초(s)**

---

## 1. Markets — `/api/markets`

### `GET /api/markets/tickers`
전체 종목의 현재 시세 목록. **거래대금(24h) 내림차순 정렬**(인기 종목 우선) — 코인 목록·비교 분석·스크리너·대시보드 산점도가 이 순서를 공유한다.
- **응답**: `Ticker[]`

### `GET /api/markets/tickers/{market}`
단일 종목 시세.
- **경로 파라미터**: `market` (예: `KRW-BTC`)
- **응답**: `Ticker` · 없으면 `404`

### `GET /api/markets/summary`
시장 요약 지표.
- **응답**: `MarketSummary`

### `GET /api/markets/orderbook/{market}`
호가창.
- **경로 파라미터**: `market`
- **응답**: `Orderbook` · 없으면 `404`

### `GET /api/markets/trades/{market}`
최근 체결 내역 (30건).
- **경로 파라미터**: `market`
- **응답**: `Trade[]` · 없으면 `404`

---

## 2. Candles — `/api/candles`

### `GET /api/candles/{market}`
캔들(OHLCV) 데이터.
- **경로 파라미터**: `market`
- **쿼리 파라미터**:

  | 이름 | 타입 | 기본값 | 설명 |
  |------|------|--------|------|
  | `interval` | string | `days` | 캔들 간격: `minutes/{1\|3\|5\|15\|30\|60\|240}` \| `days` \| `weeks` \| `months` |
  | `count` | int | `60` | 캔들 개수 (오래된→최신 정렬, 200 초과는 자동 페이지네이션) |

- **응답**: `CandleItem[]` (시각 오름차순)

---

## 3. Analysis — `/api/analysis`

### `GET /api/analysis/category/monthly`
섹터별 월간 수익률 (최근 6개월). 섹터 소속 종목의 월봉 close 동일가중 평균.
- **응답**: `CategoryReturns`

### `GET /api/analysis/category/cumulative-daily`
섹터별 **일간** 동일가중 지수의 누적 등락률 (최근 ~200일). 섹터 소속 종목의 일봉 close를 윈도우 첫날=1.0으로 정규화해 동일가중 평균한 지수의 누적%. 전 종목 공통 윈도우(`min_len=150`)로 모든 섹터가 같은 날짜축을 공유하며, 공용 일봉 캐시를 재사용해 추가 팬아웃이 없다.
- **응답**: `CategoryReturns` (`rows[]`에 `label`=`MM-DD`, `t`=unix초, 섹터별 누적% 포함)
- (과거 `GET /category/cumulative?period=월|분기|년`(월봉 리샘플)은 제거됨 — 일봉 누적으로 일원화)

### `GET /api/analysis/coins`
종목별 통계 (변동성·1개월 수익률 등).
- **응답**: `CoinStat[]`

### `GET /api/analysis/correlation/{market}`
지정 종목과 다른 종목들 간 상관관계 (60일 일봉 종가 기준 피어슨 계수). 상관계수 내림차순 정렬. 공통 관측이 40일 미만인 종목(신규 상장 등)은 표본 부족으로 제외한다(노이즈 방지).
- **경로 파라미터**: `market`
- **응답**: `CorrelationItem[]`

### `GET /api/analysis/advance-decline`
Advance-Decline 라인 — 시장 폭(breadth)의 추세. 거래대금 상위 100종으로 매일 (상승−하락) 종목 수를 누적한 라인 + 동일가중 시장지수. 시장지수는 오르는데 A-D가 안 오르면 소수 대형주만 끌어올린 것(divergence).
- **응답**: `AdvanceDeclineResult` — `points[{time(unix초), ad_line(누적), advancers, decliners, index(첫날=100)}]` + `n`(집계 종목 수)·`n_obs`

---

## 4. Backtest — `/api/backtest`

### `GET /api/backtest/ma-cross`
이동평균 교차(골든/데드 크로스) 전략 백테스트. **신호는 직전 완결봉 크로스로 판정 후 당일 종가 체결(익일 체결, 룩어헤드 제거).**
- **쿼리 파라미터**:

  | 이름 | 타입 | 기본값 | 범위 | 설명 |
  |------|------|--------|------|------|
  | `market` | string | `KRW-BTC` | — | 대상 종목 |
  | `fast` | int | `5` | 2~50 | 단기 이동평균 기간 |
  | `slow` | int | `20` | 5~200 | 장기 이동평균 기간 |
  | `count` | int | `200` | 60~500 | 일봉 캔들 개수 |
  | `fee_bps` | float | `5.0` | 0~100 | 편도 거래비용(bps) |
  | `target_vol` | float | `0.0` | 0~2 | 변동성 타게팅 목표(연율, 0=올인). >0이면 진입 시 직전20일 실현변동성으로 비중 축소(Phase 31) |

- **응답**: `BacktestResult`(`metrics.target_vol`·`avg_position` 포함)

### `GET /api/backtest/rsi`
RSI 역추세(과매도 매수 / 과매수 매도) 전략 백테스트.
- **쿼리 파라미터**:

  | 이름 | 타입 | 기본값 | 범위 | 설명 |
  |------|------|--------|------|------|
  | `market` | string | `KRW-BTC` | — | 대상 종목 |
  | `period` | int | `14` | 5~30 | RSI 계산 기간 |
  | `oversold` | float | `30.0` | 10~45 | 과매도 기준 (이하에서 매수) |
  | `overbought` | float | `70.0` | 55~90 | 과매수 기준 (이상에서 매도) |
  | `count` | int | `200` | 60~500 | 일봉 캔들 개수 |
  | `fee_bps` | float | `5.0` | 0~100 | 편도 거래비용(bps) |
  | `target_vol` | float | `0.0` | 0~2 | 변동성 타게팅(0=올인). RSI도 Wilder 평활(Phase 31) |

- **응답**: `BacktestResult`

> `ma-cross`·`rsi` 응답에는 거래비용(`fee_bps`, 기본 5bps) + **유동성 기반 추정 슬리피지(`slippage_bps`, 거래대금 프록시: 고유동 종목 작고 저유동 클수록 큼, 상한 100bps)** 반영 자산곡선과 두 벤치마크(같은 종목 매수보유 `benchmark`/`benchmark_return`, BTC 매수보유 `benchmark_btc`/`benchmark_btc_return`)가 함께 포함된다.

### `GET /api/backtest/compare`
한 종목에 MA 크로스·RSI 역추세를 동시에 돌려 자산 곡선을 겹쳐 비교.
- **쿼리**: `market`(기본 `KRW-BTC`), `count`(int 60~500, 기본 200), `fee_bps`(float 0~100, 기본 5)
- **응답**: `StrategyCompareResult` — `times[]`(unix초) + `strategies[{name, equity[](100시작), total_return}]`(MA·RSI 2종) + `benchmark[]`(같은 종목 매수보유) + `benchmark_btc[]`(BTC 매수보유)

### `GET /api/backtest/walk-forward`
워크포워드 검증 — 전체 기간을 `n_splits`+1 구간으로 나눠, 각 구간 직전 데이터(in-sample)에서 MA 파라미터를 그리드서치로 고르고 그 다음 구간(out-of-sample)에서만 성과를 집계. 인샘플 과최적화를 거르는 표준 검증법.
- **쿼리**: `market`(기본 `KRW-BTC`), `count`(int 120~500, 기본 300), `n_splits`(int 2~8, 기본 4), `fee_bps`(float 0~100, 기본 5)
- **응답**: `WalkForwardResult` — `folds[{fast, slow, oos_return, train_end, test_end}]`(구간별 선택 파라미터·OOS 성과) + `equity[{time, value}]`(OOS만 이어붙인 누적, 100 시작) + `total_return`·`n_splits` + **`overfit_pvalue`·`n_trials`**(다중검정 보정 — 그리드 N개에서 고른 최고 인샘플 샤프가 귀무 하 우연일 확률, 낮을수록 과최적화 아님)

### `GET /api/backtest/montecarlo`
몬테카를로 시뮬레이션 — 과거 일간수익률 분포에서 복원추출(부트스트랩)로 향후 `horizon`일 가격 경로를 `n_paths`개 생성. 정규근사 대신 실제 분포라 팻테일 보존.
- **쿼리**: `market`(기본 `KRW-BTC`), `horizon`(int 5~120, 기본 30), `n_paths`(int 200~5000, 기본 1000), `count`(int 60~500, 기본 180)
- **응답**: `MonteCarloResult` — `bands[{day, p5, p25, p50, p75, p95}]`(시점별 백분위 부채꼴, 100 시작) + `final_p5/p50/p95`·`expected_return`·`prob_loss`(%) + `daily_mean`·`daily_vol`·`n_obs`

### `GET /api/backtest/tsmom`
시계열 모멘텀(추세추종) + 변동성 타게팅 — 각 종목이 자기 과거(12-1 skip 적용) 대비 오르면 롱/현금, 변동성 역가중. 시장 약세·고변동 시 총 익스포저 동적 축소(모멘텀 크래시 필터), 턴오버 히스테리시스. 스테이블 제외·종목당 상한 25%.
- **쿼리**: `top`(10~100, 30), `lookback`(10~180, 60), `holding`(1~30, 5), `count`(120~500, 200), `fee_bps`(0~100, 5)
- **응답**: `TsmomResult` — `equity[{time, value, benchmark}]`(100 시작, benchmark=동일가중 매수보유) + `total_return`·`benchmark_return`·`sharpe`·`mdd`·`avg_exposure`(평균 투자비중%) + `holdings[{market, korean_name, momentum, weight}]`(현재 보유)

### `GET /api/backtest/portfolio`
여러 종목을 목표 비중으로 보유했을 때의 자산 곡선(가중 매수보유 + 선택적 주기 리밸런스).
- **쿼리**: `markets`(쉼표 구분, 2~10), `weights`(쉼표 구분, markets와 같은 개수·생략 시 동일가중·자동정규화), `count`(int 30~500, 기본 180), `rebalance_days`(int 0~90, 0=매수보유)
- **응답**: `PortfolioBacktestResult` — `equity[{time, value, benchmark}]`(100 시작, value=포트폴리오·benchmark=동일가중) + `total_return`·`benchmark_return`·`mdd`·`sharpe`·`volatility`(연율%) + `contributions[{market, korean_name, weight, asset_return}]` + `rebalance_days`·`n_obs`

---

## 5. Quant — `/api/quant`
정량/ML 분석. 일봉은 공용 캐시(부팅 프리페치)를 재사용하므로 추가 팬아웃 없이 계산만 든다. 모든 응답에 분석에 쓴 일간 관측 수 `n_obs` 포함. 좌표계는 `(vol=변동성 x, ret=수익률 y)` %.

| 엔드포인트 | 쿼리 | 응답 요지 |
|---|---|---|
| `GET /portfolio` | `markets`(2~8) | `PortfolioResult` — 무작위 1000 시뮬 `points[{vol,ret,sharpe}]`(Dirichlet α=0.3) + `frontier[{vol,ret,`**`weights[]`**`}]`(효율적 경계선 60점, **Phase 30 각 점의 비중 — 목표수익률 슬라이더용**) + `max_sharpe`/`min_vol`/**`risk_parity`**(`PortfolioSpot`: 좌표 + `weights[]` + **`risk_contrib[]`**(자산별 리스크 기여도%, 합100 — 비중≠리스크비중) + **`diversification`**(분산효과 비율≥1)) + `assets[{...,`**`sharpe`**`}]` + **`shrinkage`**(Ledoit-Wolf 수축 0~1) + **`corr_labels`·`corr_matrix`**(선택 바스켓 상관행렬 — 분산효과 근원) (Markowitz, scipy SLSQP) |
| `GET /network` | `top`(5~100, 50) | `NetworkResult` — `nodes[{market, category, value, degree}]` + `edges[{source,target,corr}]`(MST, networkx) |
| `GET /pca` | `top`(5~100, 50) | `PCAResult` — `components[{index,explained}]` + `loadings[{market,category,pc1,pc2}]` + `pc1_explained`(시장요인 설명비율%) |
| `GET /clusters` | `top`(10~150, 80), `k`(2~8, 4) | `ClusterResult` — `points[{market,category,cluster,volatility,return_1m,log_value}]` (K-means) |
| `GET /dendrogram` | `top`(5~60, 40) | `DendrogramResult` — scipy 플롯 좌표 `icoord/dcoord` + `labels/markets/categories`(잎 순서) |
| `GET /garch/{market}` | — | `GarchResult` — `cond_vol[{time,vol}]` + `forecast_vol[]` + `current_vol_annual`·`var_95`(정규근사)·**`hist_var_95`·`cvar_95`**(경험분위 VaR/기대손실 — 팻테일 반영)·`persistence`(arch GARCH(1,1)) |
| `GET /momentum` | `top`(10~100,40), `lookback`(5~60,20), `holding`(1~20,5), **`long_only`**(bool,false) | `MomentumResult` — `equity[{time,factor,benchmark}]` + `total_return`·`benchmark_return`·`sharpe`·`mdd` + `long[]`/`short[]` + **`long_only`**. 기본은 달러중립 롱숏(공매도 가정 — 업비트 현물 실행 불가, 학술 검증용), **`long_only=true`면 상위분위 매수만(현물 실행 가능, short[]는 빔)** |
| `GET /pairs` | `top`(5~40, 30) | `PairsResult` — `pairs[{market1,market2,pvalue,correlation,hedge_ratio,zscore,signal, bt_return,bt_trades,bt_winrate}]`(사후검증 요약 포함) + `tested`·`found` + **`best`**(최저 p값 페어 상세: `points[{time,z,equity}]`·`entry`·`exit`·**`formation_end`** — 스프레드 z+자산곡선 차트용) (statsmodels 공적분 + 롤링 z 평균회귀 백테스트). **Phase 30 — 헤지비율 β는 형성기간(앞50%)으로만 추정, 거래기간(뒤50%)만 매매하는 out-of-sample**(`formation_end`가 그 경계, 사후성과 낙관편향 제거) |
| `GET /regime` | `n_states`(2~4, 2) | `RegimeResult` — `points[{time,regime,index}]` + `stats[{regime,label,mean_return,volatility,days,share}]` + `current_regime`·`current_label` (hmmlearn HMM) |

---

## 6. 기타

### `GET /health`
서버 상태 + readiness 확인. `ready`는 부팅 프리페치(캐시 워밍) 완료 여부 — `false`면 워밍 중(오케스트레이터가 트래픽을 늦게 보낼 수 있음), `SKIP_PREFETCH=1`이면 곧장 `true`.
- **응답**: `{ "status": "ok", "ready": <bool> }`

### `GET /api/report/strategy`
LLM(Gemini `gemini-2.5-flash`, thinking 끄고 출력 4096토큰) 투자 전략 리포트 — 시장 데이터(프리페치 재사용)를 모아 **부문별 전용 프롬프트**(시장/포트폴리오/리스크 각 초점·출력 형식)로 생성. **Gemini 실연동**(키는 `backend/.env`의 `GEMINI_API_KEY`, `google-genai`). **자동 초안(stub) 없음** — **503(서버 과부하)은 3회 백오프 재시도** 후, 키 미설정·비일시적 오류·빈 응답이면 **502**로 전파(실패는 캐시 안 함). 성공만 **종류별 차등 캐시**(시장 2h / 포트·리스크 6h).
- **쿼리**: `report_type`(`market`|`portfolio`|`risk`, 기본 `market`)
- **응답(200)**: `ReportResult` — `report_type`·`title`·`markdown`·`model`·`generated_at`(unix초)·`enabled`(성공 True)·`note`
- **오류(502)**: `{ detail: "..." }` — Gemini 호출 실패/키 미설정 사유

### `GET /api/system/metrics`
관측성 메트릭(외부 의존성 없는 자체 구현). 캐시 적중률·외부 호출수·평균 응답시간·최근 요청(rid) + **외부 소스 헬스(Phase 31)**.
- **응답**: `{ uptime_sec, cache_hit_rate(%), cache_hits/stale_serves/misses, cache_keys, upbit_calls/errors, cache_revalidate_errors, requests, avg_response_ms, recent[{rid, method, path, status, ms}], sources[{name, healthy, ok, fail, last_ok_age_sec, last_fail_age_sec, last_error}] }`

### `GET /api/signals` (Phase 31)
실행 가능한 시그널 집계 — 모멘텀 롱·공적분 페어 z>2·HMM 국면 전환·52주 돌파/급등을 합성(기존 캐시 재사용, 추가 팬아웃 0).
- **응답**: `SignalsResult` — `{ as_of, regime_label, regime_changed, items[{kind(momentum|pair|regime|breakout), market, korean_name, title, detail, value, action(deep-link 경로)}], n }`

---

## 7. 실시간 WebSocket — `/ws` (업비트 WS 중계)

REST가 첫 화면(스냅샷·집계)을 책임지고, 실시간 갱신은 업비트 WebSocket을 백엔드가 중계한다. 메시지는 모두 JSON 텍스트 프레임.

### `WS /ws/tickers`
전체 KRW 마켓 현재가 실시간 스트림. 백엔드는 업비트 ticker WS **1개**만 열어 모든 클라이언트에 fan-out하는 공유 허브(`TickerHub`)를 쓴다. 신규 연결 시 보유 중인 최신 스냅샷을 즉시 푸시한 뒤, 이후 변동분을 가격이 바뀔 때마다 푸시.
- **서버→클라이언트 메시지**: `{ market, trade_price, change(RISE|FALL|EVEN), change_rate(부호 있음), change_price, acc_trade_price_24h }`
- 클라이언트→서버 전송 없음(연결 종료 감지용으로만 수신 대기). 끊기면 프론트가 3초 후 재연결.

### `WS /ws/market/{market}`
코인 상세용 — 한 종목의 호가(orderbook)·체결(trade) 실시간 스트림. 종목별 on-demand 연결(공유 허브 불필요).
- **호가 메시지**: `{ type: "orderbook", asks[{price, size}], bids[{price, size}] }`
- **체결 메시지**: `{ type: "trade", timestamp(초), price, volume, side(ASK|BID) }`

---

## 8. 트렌드 대시보드 — `/api/trends` (업비트 '코인동향' 미러)

업비트 시세 기반 자체 산출 + 외부 소스(환율·뉴스·시총). **외부 실패 시 응답의 `error` 필드에 "소스 교체 필요" 메시지**(프론트가 숨기지 않고 노출).

| 엔드포인트 | 응답 요지 |
|---|---|
| `GET /indices` | `TrendsIndices` — `indices[{key,label,value,change_rate,spark[],today[{h,pct}],prev[{h,pct}],n}]`. 자체 동일가중 시장지수(종합·알트·BTC그룹·ETH그룹·상위10/30) + 60분봉 당일/전일 인트라데이(시가 대비 %) |
| `GET /asset-indices` | `AssetIndices` — `rows[{key,label,desc,tab(시장\|전략\|테마\|섹터),value,d1,m1,m3,n}]`. 자체 동일가중 지수(전략=모멘텀Top5·저변동Top5, 테마=level2, 섹터=level1) |
| `GET /volume-power` | `VolumePower` — `buy[]`·`sell[]`(`{market,korean_name,power}`). 체결강도=매수/매도×100 (업비트 **WS 티커 `acc_ask/bid_volume`** 1회 스냅샷, 스테이블·저유동 제외). `error?` |
| `GET /period-returns` | `PeriodReturns` — `rows[{market,korean_name,acc_trade_price_24h,r1w,r1m,r3m,r6m,r1y,market_cap,market_cap_rank}]`. 일봉(≤6m)·월봉(1y) + **시총(CoinGecko 외부)** |
| `GET /brief` | `MarketBrief` — `{text,as_of,rise,fall,avg_change,dominance,dominance_label,total_volume}`. 자체 시황 한 줄. **도미넌스는 시총 기준(CoinGecko /global) 우선·라벨로 출처 명시** |
| `GET /fx` | `FxResult` — `rates[{pair,label,unit,price,change,change_rate,spark[]}]`·`as_of`·`spark_dates[]`·`error?`. 현재가 = **open.er-api.com**(10분), 추이(`spark`/`spark_dates`, 최근 ~32영업일 KRW/단위) = **frankfurter.dev/v1**(ECB 일별, 6h). 에러 60초 캐시 |
| `GET /news` | `NewsResult` — `items[{title,url,source,published,ts}]`·`error?`. **외부 한국 크립토 RSS**(블록미디어·토큰포스트·블록체인투데이, 헤드라인+링크만). HTML 응답/깨진 XML 가드 |
| `GET /fear-greed` | `FearGreed` — `{value,label,classification,as_of,source,error?}`. **외부 alternative.me** 실제 공포·탐욕(실패 시 자체 시장 폭 폴백·`source='자체(시장 폭)'`)(Phase 31) |

---

## 스키마(모델) 정의

### Ticker
| 필드 | 타입 | 설명 |
|------|------|------|
| `market` | string | 마켓 코드 (예: `KRW-BTC`) |
| `korean_name` | string | 한글 종목명 |
| `trade_price` | float | 현재가 |
| `change` | string | `RISE` \| `FALL` \| `EVEN` |
| `change_rate` | float | 등락률 (소수, 예: `0.0234` = +2.34%) |
| `change_price` | float | 전일 대비 변동 금액 |
| `acc_trade_price_24h` | float | 24시간 누적 거래대금 |
| `high_price` | float | 당일 고가 |
| `low_price` | float | 당일 저가 |
| `prev_closing_price` | float | 전일 종가 |
| `sparkline` | float[] | 미니 추세 차트용 가격 배열 |
| `is_52w_high` | bool | 52주 신고가 **오늘(KST) 경신** 여부 (`highest_52_week_date == 오늘`) |
| `is_52w_low` | bool | 52주 신저가 **오늘(KST) 경신** 여부 (`lowest_52_week_date == 오늘`) |
| `w52_high` | float | 52주 최고가 |
| `w52_low` | float | 52주 최저가 |

### MarketSummary
| 필드 | 타입 | 설명 |
|------|------|------|
| `total_volume` | float | 24h 총 거래대금 |
| `up_count` | int | 상승 종목 수 |
| `down_count` | int | 하락 종목 수 |
| `btc_dominance` | float | BTC 도미넌스 (%) |

### Orderbook
| 필드 | 타입 | 설명 |
|------|------|------|
| `market` | string | 마켓 코드 |
| `asks` | OrderbookUnit[] | 매도 호가 (낮은가격→높은가격, index 0 = 최우선 매도) |
| `bids` | OrderbookUnit[] | 매수 호가 (높은가격→낮은가격, index 0 = 최우선 매수) |

**OrderbookUnit**: `{ price: float, size: float }`

### Trade
| 필드 | 타입 | 설명 |
|------|------|------|
| `timestamp` | int | Unix 초(s) |
| `price` | float | 체결가 |
| `volume` | float | 체결량 |
| `side` | string | `BID`(매수) \| `ASK`(매도) |

### CandleItem
| 필드 | 타입 | 설명 |
|------|------|------|
| `timestamp` | int | Unix ms |
| `open` / `high` / `low` / `close` | float | 시/고/저/종가 |
| `volume` | float | 거래량 |

### CategoryReturns
섹터가 가변(업비트 분류)이라 고정 필드 대신 동적 구조를 쓴다.
| 필드 | 타입 | 설명 |
|------|------|------|
| `categories` | string[] | 섹터명 목록 (표시 순서, 한글). 예: `["스마트 컨트랙트 플랫폼", "인프라", …]` |
| `rows` | object[] | 각 `{ "label": "구간라벨", "<섹터명>": 수익률%, … }`. `label`은 `YYYY-MM`·`YYYYQn`·`YYYY` |

### CoinStat
| 필드 | 타입 | 설명 |
|------|------|------|
| `market` | string | 마켓 코드 |
| `korean_name` | string | 한글 종목명 |
| `category` | string \| null | 업비트 섹터(대분류, 한글). 예: `인프라`, `디파이`. 미분류 종목은 `null` |
| `volatility` | float | 30일 일간 수익률 표준편차 (%) |
| `return_1m` | float | 1개월 총 수익률 (%) |
| `acc_trade_price_24h` | float | 24h 누적 거래대금 |

### CorrelationItem
| 필드 | 타입 | 설명 |
|------|------|------|
| `market` | string | 마켓 코드 |
| `korean_name` | string | 한글 종목명 |
| `correlation` | float | 피어슨 상관계수 (-1.0 ~ 1.0) |

### BacktestResult
| 필드 | 타입 | 설명 |
|------|------|------|
| `equity` | EquityPoint[] | 자산 곡선 |
| `trades` | TradeRecord[] | 매매 기록 |
| `metrics` | BacktestMetrics | 성과 지표 |

**EquityPoint**: `{ time: int(s), value: float, benchmark: float, benchmark_btc: float }` — 모두 초기 자본 100 기준. `value`=전략, `benchmark`=같은 종목 매수보유, `benchmark_btc`=BTC 매수보유

**TradeRecord**: `{ time: int(s), side: "BUY"|"SELL", price: float, pnl: float }` — `pnl`은 손익률(%), `SELL`일 때만 의미 있음

**BacktestMetrics**: `{ total_return: float(%), benchmark_return: float(%), benchmark_btc_return: float(%), fee_bps: float, mdd: float(%), win_rate: float(%), trade_count: int, sharpe: float, sortino: float, calmar: float }`

리스크 조정 수익률(일별 equity 수익률 기반, 암호화폐 365일 거래 → √365 연율화):
- `sharpe`  = (평균 수익률 / 표준편차) × √365 — 변동성 단위당 수익. > 1 우수.
- `sortino` = (평균 수익률 / 하방 표준편차) × √365 — 손실 변동성만 패널티.
- `calmar`  = 연율화 수익률 / (MDD/100) — 낙폭 대비 수익.

데이터 부족(샘플 < 2)·표준편차 0·MDD 0인 경우 0.0 반환.

---

## 프론트엔드 매핑

| 화면 | 사용 엔드포인트 |
|------|-----------------|
| 대시보드 | `/api/markets/tickers`, `/api/analysis/category/monthly`, `/api/analysis/coins`, `/api/quant/regime`, `WS /ws/tickers`(시세표 실시간) |
| 마켓 현황 | `/api/markets/tickers` |
| 코인 목록 | `/api/markets/tickers`, `/api/markets/summary`, `WS /ws/tickers`(현재가 실시간) |
| 탐색(마켓·섹터·스크리너 통합 `/explore`) | `/api/markets/tickers`, `/api/analysis/coins`, `/api/analysis/category/monthly`, `/api/analysis/category/cumulative-daily` |
| 코인 상세 | `/api/markets/tickers/{market}`, `/api/markets/orderbook/{market}`, `/api/markets/trades/{market}`, `/api/candles/{market}`, `/api/analysis/correlation/{market}`, `/api/analysis/coins`, `/api/quant/garch/{market}`, `WS /ws/tickers`·`WS /ws/market/{market}`(현재가·호가·체결 실시간) |
| 종목 비교 (`/market/compare`, 마켓 그룹) | `/api/candles/{market}` (선택 종목별) |
| 백테스트(전략 실행, `/tools/backtest`) | `/api/backtest/ma-cross`, `/api/backtest/rsi`, `/api/backtest/tsmom`, `/api/backtest/portfolio` |
| 검증·시뮬레이션 (`/strategy/validation`, 3기법 한 페이지) | `/api/backtest/compare`, `/api/backtest/walk-forward`, `/api/backtest/montecarlo` |
| 시장 구조 (`/structure`) | `/api/quant/network`, `/api/quant/clusters`, `/api/quant/dendrogram` |
| 시장 국면 (`/regime`) | `/api/quant/pca`, `/api/quant/regime` |
| 팩터 (`/factor`) | `/api/quant/momentum`(±`long_only`), `/api/quant/pairs` |
| 리스크 (`/risk`) | `/api/analysis/coins` (변동성·VaR 재사용, 추가 호출 0) |
| 최적화 (`/tools/portfolio`) | `/api/quant/portfolio` |
