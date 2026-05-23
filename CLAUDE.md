# CLAUDE.md

이 파일은 Claude Code(및 협업자)가 이 레포에서 작업할 때 참조하는 규칙·구조 문서입니다. 어느 PC에서든 세션 시작 시 자동 로드됩니다.

## 프로젝트

**UPquant** — 업비트(Upbit) KRW 마켓 암호화폐 분석 대시보드. 백엔드(FastAPI) + 프론트(React/Vite) 모노레포.
시세 탐색 + 카테고리 분석 + 종목 비교 + 전략 백테스트 + 조건 스크리닝.

## 실행

```bash
# 백엔드 (venv: backend/.venv)
cd backend && .venv/bin/fastapi dev app/main.py     # → :8000, /docs
# 프론트
cd frontend && npm run dev                          # → :5173
```
Node는 22.x(nvm) 사용. 두 서버를 함께 실행해야 함(프론트가 `http://localhost:8000` 호출, CORS는 `:5173` 허용).

## 아키텍처 (Spring 유사 계층, 단방향)

```
Frontend:  pages/ → hooks/ → api/(axios)
Backend:   routers/(≈Controller) → services/(≈Service, +캐시) → clients/(≈Repository, httpx)
                                                                      ↓
                                                          Upbit Open API (api.upbit.com/v1)
```

## 데이터 소스 (중요)

- **업비트 시세(Quotation) REST API**로 실연동. **인증/API Key 불필요** (거래소 API 아님).
- 사용 엔드포인트: `/market/all`, `/ticker`, `/candles/*`, `/orderbook`, `/trades/ticks`.
- 마켓 유니버스는 `core/config.py`의 `MARKET_CATEGORIES`(15종 KRW). 부팅 시 `/market/all`과 **교집합만** 사용 → 상장폐지 종목 자동 제외. (예: `KRW-MATIC`은 POL 마이그레이션으로 폐지 → `KRW-POL` 사용)
- **카테고리별 월별/누적 수익률만 예시(더미)** — 업비트가 코인 카테고리를 제공하지 않음. 그 외 변동성·1개월수익률·상관관계는 실 캔들 기반.

## 필드/포맷 규약

- `Ticker.change_rate` = Upbit `signed_change_rate`(부호 있음). `w52_high/low` = `highest/lowest_52_week_price`.
- 캔들은 **오름차순(오래된→최신)** 으로 반환 (lightweight-charts 요구). Upbit는 최신순이라 뒤집음.
- `CandleItem.timestamp`=ms, `Trade.timestamp`=초(프론트가 ×1000), `EquityPoint.time`=초.
- 프론트 캔들 interval: `minutes/{1|3|5|15|30|60|240}` | `days` | `weeks` | `months`.

## 성능/관측성 (직접 구현, 외부 의존성 없음)

- **캐시** `core/cache.py`: 인메모리 TTL + **stale-while-revalidate + single-flight**. 만료돼도 옛 값 즉시 반환, 갱신은 백그라운드 1스레드. 일봉은 종목별 200개 1회 fetch 후 슬라이스 공유(상관관계 ~1800ms→~5ms). TTL은 config.
- **레이트리밋**: `clients/upbit_rest.py`에 전역 스로틀(~초당 8회) + 429 백오프 재시도. 캐싱 없으면 캔들 팬아웃으로 429 발생함(실증됨).
- **부팅 프리페치**: `main.py` lifespan이 백그라운드로 `get_tickers()` 워밍.
- **통합 로깅**: `core/logging.py`의 `contextvars` 기반 요청 ID(rid)를 3계층 로그에 주입 — axios 인터셉터(프론트) / FastAPI 미들웨어(인바운드) / httpx `event_hook`(Upbit). 백엔드가 `X-Request-Id` 헤더로 전파. 같은 rid로 한 요청 전 구간 추적(Spring MDC 유사). 백그라운드 작업은 rid=`-`.

## UI 컨벤션

- **색상**: 상승/매수/양(+) = 빨강, 하락/매도/음(−) = 파랑 (한국 거래소 관행). 헤더 네이비 `#093687`(업비트 톤).
- **커서**: 클릭 가능 요소(`button`/`select`/onClick 행)에만 `cursor-pointer`, disabled엔 `disabled:cursor-not-allowed`. **일반 텍스트엔 `cursor-default`를 넣지 말 것**(브라우저 기본값에 위임, I-beam 신호 보존). 앵커는 기본 pointer라 생략.
- 라우트 8개: `/`(대시보드) `/market` `/coins` `/coins/:market` `/compare` `/backtest` `/screener` `/help`. `/help`는 헤더 버튼에서 `window.open`으로 띄우는 **별도 창**이라 Layout(헤더) 밖 단독 라우트.

## 작업 규칙

- 사용자와 **한국어**로 소통.
- **커밋은 사용자가 직접** 한다. 커밋 메시지는 추천만 하고, `git commit`/`push`는 실행하지 말 것.
- **`.gitignore`: `*.md`는 기본 무시(로컬 메모용)**. 추적되는 마크다운은 `README.md`, `CLAUDE.md`, `references/*.md`, `docs/*.md`뿐. `references/QAE_EDA_*`(원본 기획서 .docx/.pdf)는 의도적으로 제외(로컬 보관). 새 .md를 git에 올리려면 예외 규칙 추가 필요.
- 문서: 프로젝트 개요/구조 → `README.md`, 작업 이력 → `docs/HISTORY.md`, API 명세 → `references/API.md`, 계획서 → `references/프로젝트계획서.md`.

## 미적용 / 향후

WebSocket 실시간 시세, 카테고리 수익률 실데이터화, Redis(분산 캐시), TypeScript, 테스트, 다크모드, 배포.
