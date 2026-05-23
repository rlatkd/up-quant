# UPquant API 명세서

UPquant 백엔드(FastAPI) REST API 명세입니다. 응답은 **업비트 Open API(시세, 인증 불필요)** 를 호출해 생성하며, 인메모리 TTL 캐시(stale-while-revalidate)로 제공됩니다. (단, 카테고리별 수익률만 예시 데이터)

- **Base URL**: `http://localhost:8000`
- **자동 생성 문서** (서버 실행 중일 때):
  - Swagger UI: <http://localhost:8000/docs>
  - ReDoc: <http://localhost:8000/redoc>
  - OpenAPI JSON: <http://localhost:8000/openapi.json>
- **인증**: 없음
- **CORS**: `http://localhost:5173`(프론트엔드)만 허용
- **응답 헤더**: 모든 응답에 추적용 `X-Request-Id`(rid) 포함 — 프론트·백엔드·업비트 로그가 같은 rid로 묶임
- **캐싱/레이트리밋**: 업비트 시세 호출은 전역 스로틀(~초당 8회) + 429 재시도로 보호되며, 결과는 TTL 캐시(ticker 5s · candle 30s · market_all 1h 등). 첫 호출(콜드)만 다소 느리고 이후·만료 시에도 즉시 응답.

---

## 공통 사항

### 지원 마켓 (15종)
`config.MARKET_CATEGORIES`에 정의하며, 부팅 시 `/v1/market/all`과 교집합만 사용(상장폐지 종목 자동 제외).
```
KRW-BTC  KRW-ETH  KRW-XRP   KRW-SOL   KRW-DOGE
KRW-ADA  KRW-LINK KRW-AVAX  KRW-DOT   KRW-ATOM
KRW-NEAR KRW-SAND KRW-MANA  KRW-POL   KRW-1INCH
```
> KRW-MATIC은 폴리곤 POL 마이그레이션으로 상장폐지되어 **KRW-POL**로 교체됨.

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
전체 종목의 현재 시세 목록.
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
카테고리별 월간 수익률 (최근 6개월 고정).
- **응답**: `CategoryMonthly[]`

### `GET /api/analysis/category/cumulative`
카테고리별 누적 수익률 (최근 5년, 초기값 대비 %).
- **쿼리 파라미터**:

  | 이름 | 타입 | 기본값 | 설명 |
  |------|------|--------|------|
  | `period` | string | `월` | 집계 단위: `월` \| `분기` \| `년` (그 외 값은 `월`로 처리) |

- **응답**: `CategoryMonthly[]` (`month` 필드에 라벨이 들어감 — 예: `2026-05`, `2026Q2`, `2026`)

### `GET /api/analysis/coins`
종목별 통계 (변동성·1개월 수익률 등).
- **응답**: `CoinStat[]`

### `GET /api/analysis/correlation/{market}`
지정 종목과 다른 종목들 간 상관관계 (60일 일봉 종가 기준 피어슨 계수). 상관계수 내림차순 정렬.
- **경로 파라미터**: `market`
- **응답**: `CorrelationItem[]`

---

## 4. Backtest — `/api/backtest`

### `GET /api/backtest/ma-cross`
이동평균 교차(골든/데드 크로스) 전략 백테스트.
- **쿼리 파라미터**:

  | 이름 | 타입 | 기본값 | 범위 | 설명 |
  |------|------|--------|------|------|
  | `market` | string | `KRW-BTC` | — | 대상 종목 |
  | `fast` | int | `5` | 2~50 | 단기 이동평균 기간 |
  | `slow` | int | `20` | 5~200 | 장기 이동평균 기간 |
  | `count` | int | `200` | 60~500 | 일봉 캔들 개수 |

- **응답**: `BacktestResult`

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

- **응답**: `BacktestResult`

---

## 5. 기타

### `GET /health`
서버 상태 확인.
- **응답**: `{ "status": "ok" }`

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
| `is_52w_high` | bool | 52주 신고가 여부 |
| `is_52w_low` | bool | 52주 신저가 여부 |
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

### CategoryMonthly
| 필드 | 타입 | 설명 |
|------|------|------|
| `month` | string | 기간 라벨 (`YYYY-MM` 등) |
| `layer1` / `defi` / `meme` / `gaming` / `layer2` | float | 카테고리별 수익률 (%) |

### CoinStat
| 필드 | 타입 | 설명 |
|------|------|------|
| `market` | string | 마켓 코드 |
| `korean_name` | string | 한글 종목명 |
| `category` | string | 카테고리 (`layer1`, `defi`, `meme`, `gaming`, `layer2`) |
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

**EquityPoint**: `{ time: int(s), value: float }` — `value`는 초기 자본 100 기준

**TradeRecord**: `{ time: int(s), side: "BUY"|"SELL", price: float, pnl: float }` — `pnl`은 손익률(%), `SELL`일 때만 의미 있음

**BacktestMetrics**: `{ total_return: float(%), mdd: float(%), win_rate: float(%), trade_count: int }`

---

## 프론트엔드 매핑

| 화면 | 사용 엔드포인트 |
|------|-----------------|
| 대시보드 | `/api/markets/tickers`, `/api/analysis/category/monthly`, `/api/analysis/category/cumulative`, `/api/analysis/coins` |
| 마켓 현황 | `/api/markets/tickers` |
| 코인 목록 | `/api/markets/tickers`, `/api/markets/summary` |
| 코인 상세 | `/api/markets/tickers/{market}`, `/api/markets/orderbook/{market}`, `/api/markets/trades/{market}`, `/api/candles/{market}`, `/api/analysis/correlation/{market}` |
| 비교 분석 | `/api/candles/{market}` (선택 종목별) |
| 백테스트 | `/api/backtest/ma-cross`, `/api/backtest/rsi` |
| 스크리너 | `/api/markets/tickers`, `/api/analysis/coins` |
