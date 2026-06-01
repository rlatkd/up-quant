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
- **분석 유니버스는 KRW 마켓 전체(~261종)** — `core/config.py`의 `USE_ALL_KRW_MARKETS`. 부팅 시 `/market/all`과 **교집합만** 사용 → 상장폐지 종목 자동 제외. (예: `KRW-MATIC`은 POL 마이그레이션으로 폐지 → `KRW-POL` 사용).
- **카테고리(섹터) 분류 = 업비트 데이터랩 '코인 분류' 스냅샷** (`app/data/upbit_sectors.json`). 업비트 시세 Open API는 카테고리를 안 주므로, 데이터랩(`datalab.upbit.com/sector?tab=marketMap`)의 Next.js RSC 페이로드를 **1회 스크랩**해 정적 파일로 보관. 261종 전체에 level1(대분류 5종: 스마트 컨트랙트 플랫폼·인프라·디파이·문화/엔터테인먼트·밈)/level2/level3 + marketCap. `config.MARKET_CATEGORIES`(market→level1)·`CATEGORY_LIST`(종목수 desc)·`MARKET_SUBCATEGORIES`로 노출. 스냅샷이라 신규 상장은 미분류(`None`), 분류 변경 시 재스크랩 필요. (스크랩 경위·후보 비교는 엔지니어링노트 §12)
- **카테고리 수익률은 실데이터** — 섹터 소속 종목의 **월봉 close 동일가중 평균**으로 월별/누적 수익률 집계(`analysis_service`). 상관관계 히트맵은 프론트가 월별값으로 계산. (집계 방식·변동성 드래그는 엔지니어링노트 §14) 더 이상 더미 아님 → "예시" 배지는 "업비트 분류" 출처 배지로 대체.

## 필드/포맷 규약

- `Ticker.change_rate` = Upbit `signed_change_rate`(부호 있음). `w52_high/low` = `highest/lowest_52_week_price`.
- **52주 신고가/신저가 판정**: `Ticker.is_52w_high/low` = 업비트 `highest/lowest_52_week_date`가 **오늘(KST)인지**(=오늘 경신). 과거엔 `현재가 ≥/≤ 52주가`로 판정했으나 정확히 일치하는 순간이 거의 없어 전수 0개였음 → 달성일 기준으로 변경(엔지니어링노트 §11). **마켓현황 배지(`W52Badges`)는 거래대금 상위 30종(`Market.W52_LIMIT`)으로 한정 노출** — 하락장에 유동성 낮은 잡코인 신저가가 수십 개 깔리는 노이즈 제거(메이저 경신만 신호로 취급, 트리맵 30과 통일). 판정 자체는 전 종목 계산.
- **카테고리 수익률 응답** `CategoryReturns` = `{ categories: [섹터명…], rows: [{ label, <섹터명>: 수익률%, … }] }`. (과거 고정 5필드 `CategoryMonthly`에서 동적 구조로 변경 — 섹터가 가변이므로). `/analysis/category/monthly`(최근 6개월)·`/cumulative?period=월|분기|년`.
- 캔들은 **오름차순(오래된→최신)** 으로 반환 (lightweight-charts 요구). Upbit는 최신순이라 뒤집음.
- `CandleItem.timestamp`=ms, `Trade.timestamp`=초(프론트가 ×1000), `EquityPoint.time`=초.
- 프론트 캔들 interval: `minutes/{1|3|5|15|30|60|240}` | `days` | `weeks` | `months`.
- **정렬**: `market_service.get_tickers()`는 **거래대금(`acc_trade_price_24h`) 내림차순**으로 반환(인기 종목 우선). 이를 그대로 따르는 코인목록(`/coins`)·비교분석(`/compare`)·스크리너(`/screener`)·대시보드 산점도가 동일 순서로 통일됨(`analysis_service.get_coin_stats()`도 `get_tickers()` 재사용). 코인목록 초기 정렬 헤더도 거래대금 desc(↓ 표시). **마켓현황(`/market`)은 자체 정렬**(상승률/하락률/거래대금 상위 등)이라 예외.
- **금액 표기(거래대금·가격)**: 전체 원화 + **천단위 콤마 + 작은 회색 "KRW" 접미사**(B안, 2026-05-28 사용자 선택). 적용처: 대시보드 24h 총거래대금 KPI(`fmtKrw`+`text-xl`)·마켓현황 상단 카드 가격(`MiniCard`)·거래대금 상위 표(`VolumeTable`). 후보였던 "백만 단위(업비트 실제 방식)"·"조/억 한글"은 미채택 — "전체 표기로 있어보이게" 우선(엔지니어링노트 §17). **예외: 코인목록 표의 거래대금 컬럼은 `억` 단위(`fmtVolume`) 유지**(261행 밀도상 전체 콤마는 가독성 저하).

## 성능/관측성 (직접 구현, 외부 의존성 없음)

- **캐시** `core/cache.py`: 인메모리 TTL + **stale-while-revalidate + single-flight**. 만료돼도 옛 값 즉시 반환, 갱신은 백그라운드 1스레드. 일봉은 종목별 200개 1회 fetch 후 슬라이스 공유(상관관계 ~1800ms→~5ms). TTL은 config. 유니버스 전체 확장에 따라 일봉/스파크라인 TTL은 장기화해 팬아웃 부하 억제.
- **레이트리밋**: `clients/upbit_rest.py`에 전역 스로틀(~초당 8회) + 429 백오프 재시도. 캐싱 없으면 캔들 팬아웃으로 429 발생함(실증됨).
- **성능 원칙 (중요)**: 클라우드/멀티 인스턴스 전제 — **대량 팬아웃(수백 콜)은 서버 기동 시 1회만** 하고, 이후엔 어떤 클라이언트가 접속하든 캐시 히트로 빨라야 한다. 클라이언트가 매 요청마다 수십~수백 콜을 떠안으면 안 됨. (새 무거운 집계를 추가하면 **프리페치 워밍 범위도 반드시 함께 갱신** — 안 그러면 첫 방문자가 콜드 비용을 떠안음)
- **부팅 프리페치(동기 워밍)**: `main.py` lifespan이 `_prefetch()`를 **동기로 워밍한 뒤 기동**(`await asyncio.to_thread(_prefetch)`). 워밍 대상: `get_tickers()`(현재가+스파크라인) + `get_coin_stats()`(변동성·수익률, 일봉 팬아웃) + **`get_category_monthly()`/`cumulative(월·분기·년)`(섹터 월봉 261종 팬아웃, 콜드 ~1분; monthly가 만든 월봉 series를 cumulative 3종이 재사용해 fetch는 1회)**. 기동이 느려지는(스로틀 초당 8회) 대신 첫 사용자도 콜드 없이 즉시 응답. 대시보드(시세 표·위젯 모두 tickers·월봉 기반)·마켓·코인목록·카테고리를 커버. 종목별 호가·체결·캔들(10 interval)·상관관계는 호출 수(수천)·실시간성(짧은 TTL) 때문에 프리페치 제외 → 해당 종목 첫 방문 시 fetch.
- **통합 로깅**: `core/logging.py`의 `contextvars` 기반 요청 ID(rid)를 3계층 로그에 주입 — axios 인터셉터(프론트) / FastAPI 미들웨어(인바운드) / httpx `event_hook`(Upbit). 백엔드가 `X-Request-Id` 헤더로 전파. 같은 rid로 한 요청 전 구간 추적(Spring MDC 유사). 백그라운드 작업은 rid=`-`.

## UI 컨벤션

- **색상(업비트 톤, Phase 15)**: 상승/매수/양(+) = 빨강, 하락/매도/음(−) = 파랑 (한국 거래소 관행, **의미색은 고정·불변**). **액센트 = 업비트 블루** — `brand-500 #1763b6`(버튼·활성탭·포커스·스피너·선택강조 등 크롬 전부), 헤더 네이비 `brand-700 #093687`. **과거 indigo(보라빛) 액센트를 전 페이지 교체**. 색 토큰은 `index.css`의 `@theme`(`--color-brand-*`)로 정의 → `bg-brand-500`·`text-brand-600` 등으로 사용. **페이지 배경 옅은 회색**(`bg-gray-50`)에 흰 카드, 카드 라운드 `rounded-md`(과거 `rounded-lg`에서 완화). 본문 폰트 **Pretendard**(`index.css` CDN import).
- **구분용 색 팔레트**: 방향 없는 시리즈/섹터 구분색은 `src/theme.js`의 `SERIES`(7색)·`DOM_COLORS`(지배력 도넛)로 **한 곳에서** 관리. Sectors(`CAT_PALETTE = SERIES`)·Dashboard(`DOM_COLORS`)·Compare(`COLORS`)가 import. (과거 컴포넌트마다 흩어져 튀던 indigo/emerald/violet 정리.) **팔레트는 밝은 톤으로 조정**(Phase 16, 사용자 "너무 어둡다"): 블루 `#4c8dd6`·teal `#27b3ab`·amber `#e0913c`·violet `#9b7fc7`·slate `#7d93a8`·rose `#d56e83`·green `#4cae76`. `DOM_COLORS`는 **단일 블루 농담이 아니라 hue 분리**(블루·teal·amber·violet + 기타 회색 `#d1d5db`) — 도넛 5조각이 다 파래서 구분 안 된다는 피드백 반영. ⚠️ 의미색(상승 빨강 `#ef4444`/하락 파랑 `#3b82f6`)과 안 헷갈리게 순수 red/blue는 제외. (CoinDetail 지표 토글 MA/Bollinger/RSI 색은 차트 오버레이와 묶여 있어 미변경.)
- **로고/헤더**: 로고는 **흰색 기울임꼴 워드마크 `UPquant`**(별도 아이콘 마크 없음 — 사용자가 "업비트엔 그런 거 없다"고 명시). `font-black italic tracking-wide`(사용자 "더 굵게" 요청, Phase 16). 동그란 "UP" 아이콘은 **favicon/앱 아이콘에만**(파란 원 + 흰 기울임 UP, 파일은 `public/favicon.png` — Phase 16에 `favicon.svg`→PNG 교체, `index.html`이 PNG 참조). 헤더 탭 글씨 볼드(비활성 `font-semibold`·활성 `font-bold`).
- **공용 UI 컴포넌트**(`src/components/ui/`): `PageHeader`(페이지 상단 제목+설명, **전 페이지 적용**)·`Spinner`·`Card`/`CardHeader`·`StatCard`. 카드 스타일·간격·제목을 한 곳에서 통일하려는 토대. (Card/StatCard는 생성만 해뒀고 기존 KpiCard/MetricCard는 이미 톤이 맞아 미적용 — 필요 시 교체.)
- **커서**: 클릭 가능 요소(`button`/`select`/onClick 행)에만 `cursor-pointer`, disabled엔 `disabled:cursor-not-allowed`. **일반 텍스트엔 `cursor-default`를 넣지 말 것**(브라우저 기본값에 위임, I-beam 신호 보존). 앵커는 기본 pointer라 생략.
- 라우트(**Phase 20 재편**): `/`(대시보드) `/explore`(탐색) `/coins` `/coins/:market` `/quant`(퀀트 랩) **+ `/compare`·`/backtest`(분석 도구)** 는 Layout(헤더) 안. `/help`(도움말)만 헤더 **? 버튼**에서 `window.open`으로 띄우는 **별도 창**이라 Layout 밖 단독 라우트. **탐색 통합**: 과거 별도였던 `/market`·`/sectors`·`/screener`는 모두 `Explore`(`/explore`) 단일 페이지의 **URL 기반 서브탭**(시장 현황·섹터·스크리너)으로 렌더 — 경로가 곧 초기 탭이라 기존 딥링크·대시보드 링크 호환. **헤더 구성**: 메인 탭 3개(대시보드·탐색·코인목록) + **"서비스 더보기" 드롭다운**(비교분석·백테스트 — 스크리너는 탐색으로 이동) + **별도 강조 "퀀트 랩" 탭**(앰버색·차트 아이콘, 정량 분석 플래그십). 헤더는 `sticky top-0 z-50` 고정. 더보기 도구·퀀트 랩은 **진입 즉시 디폴트 결과** + 제목 옆 `?` 안내 툴팁(공용 `components/InfoTooltip.jsx`). (헤더 진화: 과거 6탭 평면 → 4탭+더보기 드롭다운(Phase 16) → 탐색 통합·퀀트 랩 추가(Phase 20). 엔지니어링노트 §22.)
- **페이지 역할 분담(Phase 16)**: **대시보드 = 시세 표(메인) + 인사이트 위젯 + 드릴다운 진입점**. 3블록 — ⑴KPI 4 ⑵**2-컬럼: 왼쪽(2/3) 시세 표**(거래대금 상위 16종 — 순위·코인·현재가·24h·1일 스파크라인, 행클릭→상세) + **오른쪽(1/3) 위젯 스택**(공포탐욕 게이지·시장 지배력 도넛·급등급락) ⑶**하단 2-컬럼**(이번 달 섹터 성과→`/sectors` / 52주 신고·신저 요약→`/market`). 깊은 분석(카테고리 3종·산점도)은 섹터분석으로 보내고, 메인은 **빽빽한 시세 표를 중심 데이터 덩어리로** 둬 세로를 채우고 시장 전체를 보여준다(진짜 크립토 대시보드 정석). 전부 프리페치된 tickers·월봉 기반이라 콜드 0. (한때 "비트코인 단독 추세 히어로"를 뒀으나 "한 코인만 대표하는 게 어색·여전히 휑함" 피드백으로 시세 표로 교체 — 엔지니어링노트 §22.) **섹터 분석(`/sectors`, 신설) = top-down 인사이트**(카테고리 누적·월별·상관 + 리스크-수익 분포) — 과거 대시보드에 다 몰려 무겁던 카테고리 3종+산점도를 이리로 이동. **마켓 현황 = 순위·트리맵·52주**. 급등급락(대시보드 요약) ↔ 상승/하락 상위(마켓 전체 순위)는 "한눈 요약 ↔ 자세히" 관계.

## 작업 규칙

- 사용자와 **한국어**로 소통.
- **커밋은 사용자가 직접** 한다. 커밋 메시지는 추천만 하고, `git commit`/`push`는 실행하지 말 것.
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

- **IA 재편 + 라우트 정리 + 동선/가이드(2026-06-01)** — Phase 21. ⑴분석/도구 분리 리팩터 마감(헤더 드롭다운→평탄 탭, "팩터·전략"→"팩터 분석" 개명, 도구의 GARCH 탭 제거=코인상세 일원화) ⑵탐색의 묻힌 서브탭(마켓·섹터·스크리너)을 **헤더 탭으로 승격** + 의도별 그룹 구분선 ⑶**코인 목록을 메인('/')으로**(로고=코인목록), 대시보드는 `/dashboard`로, 코인목록 헤더 탭 제거 ⑷시장구조/팩터분석 라우트 `/analysis/*`→`/structure`·`/factor`(크로스링크 4곳 정정) ⑸C-⑨ 포트폴리오 동선(축소안): 최적화 ★/◆ 비중 카드에 `이 비중으로 백테스트 →`(Tools가 preset 보관→백테스트 포트폴리오 모드 자동) ⑹중복정리: 마켓 거래대금 표 제거·대시보드 W52Summary/MoversFeed 제거(오늘의 시그널 일원화)·시세표 전폭 ⑺시장구조/팩터분석 상단 "한눈 요약" 스트립 ⑻**별도 가이드 창 `/guide`**(방법론·기술스택 + 다이어그램 placeholder, 헤더 "가이드" 버튼). 빌드·ESLint 통과, 브라우저는 사용자 직접 확인 중.

**다음 작업 (우선순위 순)**
1. ⭐ **리스크 신규 탭 (착수 직전 보류)** — 시장 분석 그룹에 **`/risk` 신설**. 전종목 변동성 분포·정규근사 1일 95% VaR(=1.645×일변동성)·리스크 랭킹. 데이터=기존 `coinStats`(프리페치, 추가 호출 0). Analysis.jsx에 risk seg/GROUP/요약 스트립 + 헤더 탭(시장구조·팩터분석 옆) + App 라우트.
2. **코인 상세 보강 (보류)** — 딱 2개: ⑴거래대금 순위(전체 KRW 중 N위, `tickers` 계산) ⑵호가 매수/매도 압력 바(`orderbook` 잔량 비율). 추가 호출 0, 기존 카드 통합. (계산값 넣었다 되돌린 상태)
3. **대시보드 제거 예정** — 루트가 코인목록으로 바뀌어 의미 축소. 제거 시 유용 위젯(공포탐욕·지배력·오늘의 시그널)은 코인목록/탐색 이전 검토.
4. **문서 동기화 (이번 세션 미반영)** — README·pages.md·엔지니어링노트가 옛 IA(`QuantLab.jsx`·`/quant`·드롭다운·탐색 통합) 기준. **Help.jsx 본문도 stale**(옛 페이지 구조·제거 위젯 참조).
5. **브라우저 육안 검증** — 헤더 8탭 폭·요약 스트립·가이드 새 창·새 라우팅.
6. WebSocket 실시간 시세 · 에러/로딩 UI · 카테고리 잔여.

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
