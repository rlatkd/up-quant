# CLAUDE.md

이 파일은 Claude Code(및 협업자)가 이 레포에서 작업할 때 참조하는 규칙·구조·이력 문서입니다. 어느 PC에서든 세션 시작 시 자동 로드됩니다. (이전의 `HANDOFF.md`(세션 인계)·`docs/HISTORY.md`(작업 이력)를 이 문서 하단으로 통합했습니다. 개요/스크린샷은 `README.md`, API 명세는 `references/API.md`, 계획서는 `references/프로젝트계획서.md`.)

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
- **분석 유니버스는 KRW 마켓 전체(~261종)** — `core/config.py`의 `USE_ALL_KRW_MARKETS`. 부팅 시 `/market/all`과 **교집합만** 사용 → 상장폐지 종목 자동 제외. (예: `KRW-MATIC`은 POL 마이그레이션으로 폐지 → `KRW-POL` 사용). `MARKET_CATEGORIES`(15종 KRW)는 코인↔카테고리 **수동 매핑/폴백용**.
- **카테고리별 월별/누적 수익률만 예시(더미)** — 업비트가 코인 카테고리를 제공하지 않음. 그 외 변동성·1개월수익률·상관관계는 실 캔들 기반.

## 필드/포맷 규약

- `Ticker.change_rate` = Upbit `signed_change_rate`(부호 있음). `w52_high/low` = `highest/lowest_52_week_price`.
- 캔들은 **오름차순(오래된→최신)** 으로 반환 (lightweight-charts 요구). Upbit는 최신순이라 뒤집음.
- `CandleItem.timestamp`=ms, `Trade.timestamp`=초(프론트가 ×1000), `EquityPoint.time`=초.
- 프론트 캔들 interval: `minutes/{1|3|5|15|30|60|240}` | `days` | `weeks` | `months`.

## 성능/관측성 (직접 구현, 외부 의존성 없음)

- **캐시** `core/cache.py`: 인메모리 TTL + **stale-while-revalidate + single-flight**. 만료돼도 옛 값 즉시 반환, 갱신은 백그라운드 1스레드. 일봉은 종목별 200개 1회 fetch 후 슬라이스 공유(상관관계 ~1800ms→~5ms). TTL은 config. 유니버스 전체 확장에 따라 일봉/스파크라인 TTL은 장기화해 팬아웃 부하 억제.
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
- **`.gitignore`: `*.md`는 기본 무시(로컬 메모용)**. 추적되는 마크다운은 `README.md`, `CLAUDE.md`, `references/*.md`뿐. `references/QAE_EDA_*`(원본 기획서 .docx/.pdf)는 의도적으로 제외(로컬 보관). 새 .md를 git에 올리려면 예외 규칙 추가 필요.
- 문서 역할: 개요/구조/스크린샷 → `README.md`, API 명세 → `references/API.md`, 계획서 → `references/프로젝트계획서.md`, **작업 이력·진행 상태·세션 인계 → 본 문서 하단**.
- **작업 후 문서 갱신 (필수)**: 코드를 바꾸면 **같은 작업 안에서** 관련 문서를 함께 갱신한다. (갱신 대상이던 `HANDOFF.md`·`docs/HISTORY.md`는 본 문서로 통합·삭제됨 — 더 이상 만들지 말 것.) 변경 유형 → 갱신할 문서:
  - 기능·화면·완료항목·로드맵 변경 → `README.md`
  - API 엔드포인트·쿼리 파라미터·응답 스키마 변경 → `references/API.md`
  - 계획·범위·적용 상태 변경 → `references/프로젝트계획서.md`
  - 규칙·구조·데이터소스·성능·UI 컨벤션 변경 → 본 문서(`CLAUDE.md`)의 해당 섹션
  - 의미 있는 작업 단위 완료 → 본 문서 하단 **작업 이력**에 `Phase N` 추가 + **현재 상태 & 다음 작업** 갱신
  - 진행 상태가 바뀌면 메모리 `project_upquant.md`도 최신화 (레포 밖, 세션 컨텍스트 복원용)

## 현재 상태 & 다음 작업

**완료(요약)** — 상세는 README "현재 상태 & 로드맵" 참조.
- 업비트 시세 REST 실연동(현재가·캔들·호가·체결·마켓목록·52주), 8개 페이지 + 데이터 페칭 훅.
- 인메모리 캐시(SWR·single-flight)·부팅 프리페치·스로틀·429 재시도, rid 3계층 통합 로깅.
- 변동성·1개월수익률·상관관계(실 캔들), MA크로스/RSI 백테스트.
- 분석 유니버스 KRW 전체(~261종) 확장, 리스크-수익 산점도·마켓 트리맵·코인목록 스파크라인 개편.

**다음 작업 (우선순위 순)**
1. ⭐ **실제 화면 검증** — 백엔드+프론트 기동 후 261종 기준 확인: 리스크-수익 분포(수익률 색상·아웃라이어 표)·마켓 트리맵(상위30)/등락·거래대금 20위 표·코인목록 1일 스파크라인·비교분석 검색/스크롤 그리드. (콜드스타트 시 일봉+시간봉 캐시 워밍에 수십 초 소요 가능)
2. **WebSocket 실시간 시세** — `wss://api.upbit.com/websocket/v1` → FastAPI WS 중계 → 프론트 Context.
3. **카테고리 수익률 실데이터화 + 분류 적용** — 현재 더미(`analysis_service._MONTHLY_RAW`·`_make_cumulative_dummy`). 분류 소스 결정(수동 매핑 15종 vs 외부 API) → 월봉 집계로 월간/누적 대체 → 상관관계 히트맵·산점도 색상 실데이터화 → "예시" 배지 제거.
4. **에러/로딩 상태 UI 개선**.

**의도적으로 보류**: Redis(분산 캐시) · TypeScript 마이그레이션 · 테스트 코드 · 다크모드 · 배포 설정.

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
