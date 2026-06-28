# UPquant

> **암호화폐 퀀트 분석 대시보드** — 업비트 KRW 마켓 전체(~260종)를 퀀트 트레이딩의 의사결정 흐름으로 분석하는 웹 대시보드

<p>
  <img alt="Python" src="https://img.shields.io/badge/Python_3.11+-3776AB?logo=python&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript_strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_v4-06B6D4?logo=tailwindcss&logoColor=white">
  <img alt="WebSocket" src="https://img.shields.io/badge/WebSocket-실시간_시세-093687">
</p>

UPquant는 단순 시세 조회를 넘어 **상관분석 · PCA · 군집 · GARCH · HMM · 공적분 · 평균-분산 최적화 · 모멘텀 팩터 · VaR** 등 **9가지 정량 기법**을 각 기법의 고전 선행연구(Markowitz, Engle, Hamilton, Mantegna, Jegadeesh-Titman 등)에 기반해 구현하고, 이를 **하나의 의사결정 파이프라인**으로 엮은 것이 정체성입니다. FastAPI + React 19 모노레포이며 AWS에 실배포되어 있습니다.

![코인 목록 — 메인](images/01-coins.png)

---

## 목차

- [무엇을 답하는가](#무엇을-답하는가)
- [분석 프레임워크](#분석-프레임워크) ← 이 프로젝트의 정체성
- [화면 구성](#화면-구성)
- [기술 스택](#기술-스택)
- [아키텍처](#아키텍처)
- [데이터 소스](#데이터-소스)
- [시작하기](#시작하기)
- [배포 (AWS · CI/CD)](#배포-aws--cicd)
- [API 레퍼런스](#api-레퍼런스)
- [프로젝트 구조](#프로젝트-구조)
- [설계 노트](#설계-노트)
- [엔지니어링 의사결정 기록](#엔지니어링-의사결정-기록)

---

## 무엇을 답하는가

암호화폐는 분석하기 까다로운 자산군입니다 — 변동성이 매우 크고, 자산 간 상관이 높아(대부분 BTC를 따라 움직여) 분산 효과가 제한적이며, 24시간 쉬지 않고, 정보(시세·분류·리스크·전략 검증)가 흩어져 있습니다. 그래서 개인이 정량적으로 판단하기 어렵습니다.

> **연구 질문**: *"암호화폐 시장에서 퀀트 트레이더가 던지는 의사결정 질문 — 지금 시장 국면은 어떤가, 분산은 되는가, 어떤 팩터가 통하는가, 최적 비중은 무엇이며, 그 전략이 거래비용 후에도 수익이 나는가 — 를 **하나의 데이터 파이프라인**으로 답할 수 있는가?"*

UPquant는 이 흩어진 분석을 **다섯 단계의 의사결정 흐름**으로 통합합니다.

```
① 시장 국면        ② 자산 구조·리스크       ③ 팩터·전략          ④ 포트폴리오         ⑤ 검증
   지금 시장이          분산이 실제로            수익 팩터가          최적 비중은            전략이 거래비용
   평온/격동 중       되는가? 무엇이 함께        실재하는가?           무엇인가?            후에도 돈이 되나?
   어디인가?          움직이는가?
   ──────────         ──────────              ──────────           ──────────           ──────────
   HMM 국면           상관 네트워크·PCA·       모멘텀 팩터·          Markowitz            백테스트
   변동성 군집         K-means 군집            공적분 페어           효율적 경계선         (거래비용·알파·워크포워드)
```

---

## 분석 프레임워크

> 이 프로젝트의 정체성. **9가지 정량 기법**을 퀀트 의사결정 흐름으로 엮고, 각각을 고전 선행연구에 기반해 구현했습니다.

### 의사결정 흐름 × 기능 × 이론 × 인사이트

| 퀀트의 질문 | 대시보드 기능 (경로) | 금융·경제 이론 | 유의미한 결과 |
|---|---|---|---|
| **① 지금 시장 국면은?** | HMM 국면 탐지 (`/research/regime`) | 레짐 스위칭, 변동성 군집(ARCH 효과) | 평온/격동 국면 자동 라벨 → 리스크 온·오프·포지션 사이징 |
| **② 분산이 실제로 되나?** | 상관 네트워크(MST) · PCA · K-means 군집 (`/research/structure`·`/research/regime`) | 체계적 위험 vs 고유 위험, 시장 베타 | PC1(공통요인) 설명력이 커 한 덩어리로 움직임 → **분산효과 제한적**, 허브(BTC) 식별 |
| **③ 어느 섹터로 자금이?** | 섹터 누적수익률 · 로테이션 (`/market/sectors`) | 섹터 로테이션, 테마 모멘텀 | 강·약 섹터로 자금 흐름 방향 파악 |
| **④ 수익 팩터가 실재하나?** | 횡단면 모멘텀 롱숏 백테스트 (`/research/factor`) | 팩터 투자, 시장 효율성 | 모멘텀 분위 롱숏 성과 → 크립토 모멘텀 유효성 검증 |
| **⑤ 차익거래 기회는?** | 공적분 페어트레이딩 (`/research/factor`) | 공적분·평균회귀, 시장중립 | 동일 생태계 페어 스프레드 z-점수 → 진입 신호 |
| **⑥ 최적 비중은?** | Markowitz 효율적 경계선 (`/strategy/portfolio`) | 현대 포트폴리오 이론(MPT), 평균-분산, 샤프 | ★최대샤프 / ◆최소분산 비중 산출, 분산효과 곡선 |
| **⑦ 얼마나 잃을 수 있나?** | GARCH 변동성예측 · VaR (`/research/risk`, 코인 상세) | GARCH 변동성, Value-at-Risk | 1일 95% VaR로 하방 위험 정량화 |
| **⑧ 전략이 진짜 돈이 되나?** | 백테스트 (거래비용·벤치마크·알파·워크포워드) (`/strategy/backtest`) | 초과수익(알파), 거래비용, 생존편향 | 거래비용 차감 후에도 buy&hold 대비 알파가 남는가 |

### 분석 기법 ↔ 선행연구

| 기법 | 선행연구 / 이론 |
|---|---|
| 포트폴리오 최적화 | Markowitz (1952) — 평균-분산, 효율적 경계선 |
| 변동성 · VaR | Engle (1982) ARCH / Bollerslev (1986) GARCH, Value-at-Risk |
| 시장 국면 | Hamilton (1989) — 레짐 스위칭, Gaussian HMM |
| 상관 네트워크 | Mantegna (1999) — 최소신장트리(MST) 시장구조 |
| 시장요인 (PCA) | 주성분분석 / CAPM 체계적 위험·베타 |
| 모멘텀 팩터 | Jegadeesh & Titman (1993), Fama-French 팩터 모형 |
| 추세추종 (시계열 모멘텀) | Moskowitz·Ooi·Pedersen (2012) TSMOM, Daniel·Moskowitz (2016) 모멘텀 크래시 |
| 변동성 타게팅 | Barroso·Santa-Clara (2015), Moreira·Muir (2017) — 변동성 스케일링 |
| 공분산 추정 · 분산 | Ledoit·Wolf (2004) 수축 공분산 · 리스크 패리티 |
| 꼬리 리스크 | Historical VaR / CVaR(기대손실) — 경험분위 팻테일 반영 |
| 과최적화 검증 | 워크포워드 · 다중검정 보정(귀무 분포 대비) · 몬테카를로 부트스트랩 |
| 페어트레이딩 | Engle-Granger (1987) — 공적분, 평균회귀 |

> **방침**: 검증된 통계/ML은 라이브러리(numpy·scipy·scikit-learn·statsmodels·arch·hmmlearn·networkx)로 구현하고, **직접 구현의 정체성은 캐시·로깅·실시간 중계·인증·API 계층**에 둡니다. 예측형보다 **구조·리스크 분석**에 무게를 둡니다.

---

## 화면 구성

헤더 탭을 **자산운용 리서치 톤**(증권사·운용사 용어)으로 묶은 SPA입니다.

```
시장 동향 │ 마켓▾ │ 리서치▾  ⎟관점 구분선⎟  최적화 │ 백테스트▾ │ 검증 │ AI 전략(βeta)
          (현황·섹터·     (구조·국면·          (포트폴리오) (MA·RSI·추세·포폴)
           스크리너·비교)   팩터·리스크)
└──────── 분석 ────────┘                └──────── 실행 ────────┘
```

드롭다운 그룹명 = 경로 prefix(`/market/*`·`/research/*`·`/strategy/*`)이고, 가운데 구분선은 **분석(시장 동향·마켓·리서치) │ 실행(최적화·백테스트·검증)** 단계 경계를 나타냅니다. 로고(`/`)는 **코인 목록**(master-detail), 도움말·가이드는 별도 창입니다. **표시형 페이지는 로딩/에러 시 헤더·푸터만 남기고 전체가 로딩/에러 화면이 됩니다(부분 렌더 없음).**

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/` · `/coins/:market` | **코인 목록** (메인, master-detail) | 좌: 코인 상세(캔들 인터벌 10종·MA/Bollinger/RSI 토글·호가·체결·상관관계·GARCH/VaR·거래대금 순위) / 우: 슬림 사이드바(검색·필터·정렬·★). **현재가·호가·체결 실시간(WS)** |
| `/trends` | **시장 동향 (코인동향 미러)** | 오늘의 시황 + 뉴스 · 자체 시장지수 6카드 + 당일/전일 인트라데이(60분봉) · 주간 상승 TOP10 · **환율 추이 차트** · 랭킹(급상승·급하락·거래량급증·**체결강도**) · 디지털 자산 표(기간수익/시가총액) · 자산 지수 표 |
| `/market/{overview,sectors,screener,compare}` | **마켓** | 현황: 요약 스트립·52주 배지·상승/하락/거래대금 표(실시간)·트리맵·산점도·**A-D 라인** / 섹터: 누적·히트맵·드릴다운 / 스크리너: 다중조건·프리셋·CSV / 비교: 최대 5종 누적등락(PNG·공유링크) |
| `/research/{structure,regime,factor,risk}` | **리서치** | 시장 구조(MST·K-means 군집) · 시장 국면(PCA·HMM) · 팩터(모멘텀 롱숏·공적분 페어) · 리스크(분포·VaR) |
| `/strategy/portfolio` | **최적화** | Markowitz 효율적 경계선(구름 + 곡선 + ★최대샤프/◆최소분산/▲리스크패리티, Ledoit-Wolf 수축) + CAL·목표수익률 슬라이더·상관행렬 |
| `/strategy/backtest/:strategy` | **백테스트** | MA크로스·RSI·추세추종(TSMOM)·포트폴리오 보유 — 유동성 슬리피지·buy&hold/BTC 벤치마크·알파·Sharpe/Sortino/Calmar |
| `/strategy/validation` | **검증·시뮬레이션** | 전략 비교 · 워크포워드(다중검정 과최적화 p값) · 몬테카를로(부트스트랩 부채꼴) |
| `/system` | **시스템 모니터링** | 캐시 적중률 · 외부 호출수 · 평균 응답시간 · 최근 요청(rid) · 외부소스 헬스 — 자체 구현 메트릭 |
| `/help` · `/guide` | **도움말 · 가이드** | 기능 안내 · 방법론/기술스택(실제 화면 캡처) — 별도 창 |

> 옛/평탄 경로(`/dashboard`·`/market`·`/structure`·`/tools/*`·`/compare` 등)는 전부 리다이렉트로 호환됩니다.

<details>
<summary><b>📸 화면 스크린샷 더 보기</b></summary>

### 시장 동향
![시장 동향](images/02-trends.png)

### 마켓 — 현황 · 섹터 · 스크리너 · 종목 비교
![시장 현황](images/03-market-overview.png)
![섹터](images/04-market-sectors.png)
![스크리너](images/05-market-screener.png)
![종목 비교](images/06-market-compare.png)

### 리서치 — 시장 구조 · 시장 국면 · 팩터 · 리스크
![시장 구조](images/07-research-structure.png)
![시장 국면](images/08-research-regime.png)
![팩터](images/09-research-factor.png)
![리스크](images/10-research-risk.png)

### 전략 — 최적화 · 백테스트 · 검증
![포트폴리오 최적화](images/11-strategy-portfolio.png)
![백테스트](images/12-strategy-backtest.png)
![검증](images/13-strategy-validation.png)

### AI 전략 리포트 · 시스템 모니터링 · 도움말/가이드
![AI 전략](images/ai-strategy-modal.png)
![시스템 모니터링](images/14-system.png)
![가이드](images/popup-guide.png)
![도움말](images/popup-help.png)

</details>

---

## 기술 스택

### Backend (Python · FastAPI)

| 라이브러리 | 용도 |
|-----------|------|
| **FastAPI · uvicorn** | REST API + WebSocket · ASGI 서버 · 인바운드 로깅 미들웨어 |
| **httpx** | 업비트 REST 클라이언트 (동기 + 전역 스로틀 · 429 재시도 · `event_hooks` 로깅) |
| **websockets** | 업비트 WebSocket 중계 (실시간 시세·호가·체결, `certifi` SSL 컨텍스트) |
| **pydantic / pydantic-settings** | 응답 스키마(DTO) · 환경설정 |
| **numpy · pandas · scipy** | 수치 계산 · 수익률 행렬 · 최적화(SLSQP) |
| **scikit-learn** | PCA · K-means · 표준화 · Ledoit-Wolf 수축 공분산 |
| **statsmodels** | 공적분 검정(Engle-Granger) · OLS 헤지비율 |
| **arch** | GARCH(1,1) 변동성 예측 · VaR |
| **hmmlearn** | 가우시안 HMM 시장 국면 탐지 |
| **networkx** | 상관 네트워크 최소신장트리(MST) |
| **PyJWT · bcrypt · python-multipart** | 인증 — OAuth2 Password 플로우 + JWT(HttpOnly 쿠키) · 비밀번호 해싱 |
| **google-genai** | AI 전략 리포트 (Gemini, 선택) |

> 외부 의존성 없는 **인메모리 TTL 캐시**(`core/cache.py`, stale-while-revalidate · single-flight · 포그라운드 우선 스로틀), **요청 ID 로깅**(`core/logging.py`, `contextvars`), **WS 중계 허브**(`main.py:TickerHub`), **JWT 인증 + 레이트리밋**(`core/security.py`·`core/ratelimit.py`)을 자체 구현했습니다. 모든 `/api/*`·`/ws/*`는 로그인 가드(`Depends(current_user)`) 뒤에 있습니다. 수치 코어·캐시·설정·라우터·인증은 **pytest 43개**로 검증하며, GitHub Actions CI가 백엔드 테스트 + 프론트 lint·typecheck·**vitest**·build를 돌립니다.

### Frontend (Node · React 19 + Vite + TypeScript)

| 라이브러리 | 용도 |
|-----------|------|
| **React 19 + Vite** | UI 프레임워크 · 번들러 |
| **TypeScript (strict 전면)** | 전 소스 `.ts/.tsx` · 백엔드 스키마 거울 `types.ts`(도메인 모델 실타입) · `tsc --noEmit` · 코드 스플리팅(`React.lazy`) |
| **react-router-dom v7** | 클라이언트 사이드 라우팅 (인증 게이트) |
| **@tanstack/react-query** | 서버 상태 캐시 (동일키 디둡 · staleTime · keepPreviousData) |
| **axios** | HTTP 클라이언트 (요청 ID 인터셉터 · 쿠키 인증 · 401 갱신) |
| **recharts v3** | 분석 차트 (라인 · 산점도 · 트리맵 · 스파크라인 · 효율적 경계선) |
| **lightweight-charts v5** | 캔들차트 (코인 상세) |
| **d3-force** | 상관 네트워크 force 레이아웃 |
| **Tailwind CSS v4** | 스타일링 (`@tailwindcss/vite`, `@theme` 색 토큰) |
| **vitest + Testing Library** | 프론트 단위 테스트 |

> 실시간 시세는 `useSyncExternalStore` 기반 **외부 store + 종목별 selector**로 구독해, 261종이 고빈도로 갱신돼도 바뀐 종목의 셀만 리렌더합니다(Context 전체 구독의 리렌더 폭주 회피).

---

## 아키텍처

프론트엔드(SPA)와 백엔드(REST API + WebSocket)가 분리된 모노레포이며, 각 레이어는 단방향으로 의존합니다.

```mermaid
flowchart LR
    subgraph FE["Frontend · React SPA :5173"]
        pages["pages/"] --> hooks["hooks/"] --> apicall["api/ (axios)"]
        store["contexts/ (실시간 store)"]
    end
    subgraph BE["Backend · FastAPI :8000"]
        routers["routers/"] --> services["services/ (+캐시)"] --> clients["clients/ (httpx)"]
        hub["TickerHub (WS 중계)"]
    end
    apicall -- "HTTP /api/* (rid)" --> routers
    store -- "WS /ws/tickers" --> hub
    clients -- "REST 시세 (rid)" --> upbit["Upbit Open API"]
    hub -- "업비트 WS 1개" --> upbitws["Upbit WebSocket"]
```

**Backend 레이어** (Spring 유사 계층, 단방향)

```
routers/   ← HTTP/WS 진입점        (≈ @RestController)
   ↓
services/  ← 비즈니스 로직 + 캐싱   (≈ @Service)  ※ 업비트 응답을 가공·캐시
   ↓
clients/   ← 외부 API 호출 래퍼    (≈ @Repository)  ※ 스로틀·재시도·로깅
```

- **정량 분석**(`quant_service.py`)은 별도 데이터를 받지 않고 **공용 일봉 캐시를 재사용**합니다(`returns_matrix` 헬퍼 → 추가 팬아웃 0, 계산만).
- **실시간 중계**(`main.py:TickerHub`)는 업비트 ticker WebSocket을 **단 1개**만 열어 모든 클라이언트에 fan-out합니다. REST 캐시의 "대량 팬아웃은 1회만, 이후 공유" 원칙을 WebSocket으로 옮긴 것입니다.
- **관측성** — 프론트 axios 인터셉터 → 백엔드 미들웨어 → 업비트 `event_hook`이 모두 동일한 **요청 ID(rid)** 로 로깅됩니다. 백엔드가 `X-Request-Id` 헤더로 rid를 내려주며, 한 요청의 전 구간을 grep 한 번으로 추적할 수 있습니다(Spring MDC 유사).

---

## 데이터 소스

**공개 API와 웹스크래핑을 결합**해 시세·분류·리스크를 한 흐름으로 해석합니다.

| 데이터 | 수집 방식 | 활용 |
|---|---|---|
| **업비트 시세 Open API** | 공개 REST/WebSocket (인증 불필요) | 현재가·캔들·호가·체결·52주·체결강도(WS `acc_ask/bid_volume`) — 시세·차트·리스크·정량분석 전반 |
| **업비트 데이터랩 '코인 분류'** | 웹 스크래핑 (1회, 정적 스냅샷) | 약 260종 섹터(대분류 5)·테마 — 섹터·테마 성과 |
| **환율** (open.er-api.com · frankfurter.dev) | 외부 무료 API 2종 (백엔드 프록시·캐시) | 트렌드 대시보드 '환율' — 통화별 추이 라인차트 |
| **뉴스** (한국 크립토 RSS) | 외부 RSS 통합 (블록미디어·토큰포스트·블록체인투데이) | 트렌드 대시보드 '최신 뉴스' |
| **시가총액 · 도미넌스** (CoinGecko) | 외부 무료 API (`/coins/markets`·`/global`) | '시가총액' 탭 · 시황 도미넌스(시총 기준) |
| **공포·탐욕** (alternative.me) | 외부 무료 API | 시장 요약 (실패 시 자체 시장 폭 프록시 폴백) |

- **분석 유니버스 = KRW 마켓 전체**(약 261종). 부팅 시 `/market/all`과 교집합만 사용해 상장폐지 종목을 자동 제외합니다(예: MATIC → POL).
- 시세 API는 코인의 카테고리를 주지 않으므로, 데이터랩 '코인 분류' 페이지(Next.js RSC 페이로드)를 **1회 스크랩**해 정적 스냅샷(`upbit_sectors.json`)으로 보관합니다 — 5개 대분류: `스마트 컨트랙트 플랫폼` · `인프라` · `디파이` · `문화/엔터테인먼트` · `밈`.
- 섹터 수익률은 더미가 아닌 **실데이터**입니다(소속 종목의 일봉/월봉 close 동일가중 평균).
- **외부 소스는 실패 시 숨기지 않고 "⚠️ 소스 교체 필요"를 노출**하며, 에러 결과를 60초만 캐시해 죽은 소스에 매번 재-매달리지 않습니다.

> 업비트 Open API: REST `https://api.upbit.com/v1`, WebSocket `wss://api.upbit.com/websocket/v1`. 공개 시세는 인증 불필요.

---

## 시작하기

### 사전 요구사항

- **Python** 3.11+
- **Node.js** 20+ (권장: 22.x)

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1     # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
fastapi dev app/main.py
```

→ API 서버: <http://localhost:8000> · Swagger 문서: <http://localhost:8000/docs>

> 첫 기동 시 부팅 프리페치(동기 워밍)로 수십 초~1분 걸릴 수 있으나, 이후 모든 사용자는 캐시 히트로 콜드 없이 즉시 응답합니다.
> **개발 중**에는 `SKIP_PREFETCH=1 fastapi dev app/main.py`로 워밍을 건너뛰면 리로드마다 대기하지 않습니다(첫 요청만 콜드).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

→ 개발 서버: <http://localhost:5173>

> 프론트엔드는 `http://localhost:8000`을 백엔드로 호출하며(REST + WebSocket), 백엔드 CORS는 `http://localhost:5173`을 허용합니다. **두 서버를 함께 실행**해야 합니다.

> **로그인(인증)**: 모든 `/api/*`·`/ws/*`는 로그인을 요구합니다. 첫 화면이 로그인 페이지로, **`test` / `test`** 로 로그인합니다(과제용 하드코딩). 배포 시엔 `AUTH_SECRET`(강한 랜덤)·`COOKIE_SECURE=1`·`CORS_ORIGINS`를 환경변수로 주입하세요.

| 명령 (frontend) | 설명 |
|------|------|
| `npm run dev` | 개발 서버 (HMR) |
| `npm run build` | 프로덕션 빌드 |
| `npm run lint` | ESLint 검사 |
| `npm run typecheck` | TypeScript 타입 검사 (`tsc --noEmit`) |
| `npm run test` | 단위 테스트 (vitest) |

> **환경변수(배포·이식)**: 프론트 `VITE_API_BASE`/`VITE_WS_BASE`(미지정 시 localhost:8000, `frontend/.env.example` 참고), 백엔드 `CORS_ORIGINS`(콤마 또는 JSON 리스트)·`SKIP_PREFETCH`. 로컬은 전부 기본값으로 동작합니다.

---

## 배포 (AWS · CI/CD)

실서비스: **`https://www.skku.site`**. 프론트(정적)와 백엔드(API+WS)를 분리 호스팅합니다.

```
사용자 ──HTTPS──> CloudFront(ACM) ── S3(정적 FE, OAC)                  ← www.skku.site
        ──HTTPS/WSS──> EC2(Nginx+certbot) ── uvicorn(FastAPI, 단일 프로세스) ← api.skku.site
DNS: Route53(skku.site) — www→CloudFront(alias), api→EC2(EIP), apex→www는 CloudFront Function 301
```

<details>
<summary><b>배포 상세 (S3+CloudFront · EC2 · GitHub Actions)</b></summary>

- **프론트(S3+CloudFront)**: 빌드 산출물을 S3에 sync, CloudFront가 ACM 인증서로 HTTPS 제공. 원본은 **S3 REST 엔드포인트 + OAC**(웹사이트 엔드포인트 아님 — OAC는 REST에만 적용). SPA 라우팅은 **403/404 → `/index.html`(200)** 커스텀 에러응답. apex(`skku.site`)는 **CloudFront Function으로 www에 301 리다이렉트**.
- **백엔드(EC2 Ubuntu, t3.small)**: ⚠️ **uvicorn 단일 프로세스 systemd**로 실행 — 인메모리 캐시·WebSocket 중계 허브가 프로세스 상태라 멀티워커를 쓰면 캐시·실시간이 깨집니다. Nginx가 `api.skku.site`로 REST·WS를 같은 호스트로 프록시(certbot TLS). 부트스트랩은 [`.github/deploy/setup-ec2.sh`](.github/deploy/setup-ec2.sh).
- **CI/CD(GitHub Actions, 4워크플로)**: `main` 푸시 시 변경된 쪽만 —
  - `ci-frontend`(lint·typecheck·vitest) → 성공 시 `cd-frontend`(빌드→S3 sync→CloudFront 무효화)
  - `ci-backend`(compileall·pytest) → 성공 시 `cd-backend`(EC2 SSH→`git pull`→Secrets로 `.env` 주입→`pip`→`restart`→헬스 ready 폴링)
  - CI→CD 연결은 **`workflow_run`**(테스트 통과해야 배포). 비밀은 **GitHub Repository Secrets** 단일 소스.
- **환경변수**: 백엔드 `AUTH_SECRET`·`AUTH_PASSWORD`·`CORS_ORIGINS=https://www.skku.site`·`COOKIE_SECURE=1`·`GEMINI_API_KEY`(CD가 `.env`로 주입). ⚠️ `AUTH_SECRET`은 고정(바뀌면 발급된 JWT 전부 무효 → 전원 로그아웃).

</details>

---

## API 레퍼런스

기본 URL: 로컬 `http://localhost:8000` · 운영 `https://api.skku.site`. **모든 `/api/*`·`/ws/*`는 로그인 인증 필요**(HttpOnly 쿠키 JWT, 과제용 계정 `test`/`test`). 모든 응답에 추적용 `X-Request-Id` 헤더가 포함됩니다. 자동 생성 문서는 Swagger(`/docs`)·ReDoc(`/redoc`)·OpenAPI(`/openapi.json`).

| 그룹 | 주요 엔드포인트 |
|------|-----------------|
| **Auth** `/api/auth` | `/login`(또는 `/token`) · `/refresh` · `/logout` · `/me` · `/ws-ticket`(60초 단기 토큰) |
| **Markets** `/api/markets` | `/tickers` · `/tickers/{market}` · `/summary` · `/orderbook/{market}` · `/trades/{market}` |
| **Candles** `/api/candles` | `/{market}?interval=days&count=60` (`minutes/{1..240}`·`days`·`weeks`·`months`) |
| **Analysis** `/api/analysis` | `/category/monthly` · `/category/cumulative-daily` · `/coins` · `/correlation/{market}` · `/advance-decline` |
| **Backtest** `/api/backtest` | `/ma-cross` · `/rsi` · `/compare` · `/walk-forward` · `/montecarlo` · `/tsmom` · `/portfolio` |
| **Quant** `/api/quant` | `/portfolio`(효율적 경계선) · `/network`(MST) · `/pca` · `/clusters` · `/dendrogram` · `/garch/{market}` · `/momentum` · `/pairs`(공적분) · `/regime`(HMM) |
| **Trends** `/api/trends` | `/indices` · `/asset-indices` · `/volume-power`(체결강도) · `/period-returns` · `/brief` · `/fx` · `/news` · `/fear-greed` |
| **Signals / Report / System** | `/api/signals` · `/api/report/strategy`(AI 리포트) · `/api/system/metrics`(관측성) |
| **WebSocket** `/ws` | `/ws/tickers`(전체 현재가) · `/ws/market/{market}`(종목 호가·체결) |
| **Health** | `/health`(status · ready) |

<details>
<summary><b>엔드포인트 상세 (파라미터 · 응답 요지)</b></summary>

### Auth — `/api/auth`
- `POST /login`(또는 `/token`, form `username`/`password`) → access/refresh JWT를 **HttpOnly·Secure·SameSite=Strict 쿠키**로 설정, 본문 `{username}`. `POST /refresh` → 새 access. `POST /logout` → 쿠키 삭제. `GET /me` → `{username}`(미인증 401). `GET /ws-ticket` → `{ticket}`(WS 핸드셰이크용 60초 토큰, `?token=`으로 부착).

### Markets — `/api/markets`
- `GET /tickers` → `Ticker[]`, **거래대금(24h) 내림차순**(코인목록·비교·스크리너·산점도가 공유). `GET /tickers/{market}` → `Ticker`(없으면 404). `GET /summary` → `MarketSummary`. `GET /orderbook/{market}` → `Orderbook`. `GET /trades/{market}` → `Trade[]`(최근 30).

### Candles — `/api/candles/{market}`
- `interval`(기본 `days`, `minutes/{1|3|5|15|30|60|240}`·`days`·`weeks`·`months`), `count`(기본 60, 200 초과는 자동 페이지네이션) → `CandleItem[]`(시각 오름차순).

### Analysis — `/api/analysis`
- `GET /category/monthly` → 섹터별 월간 수익률(6개월, 월봉 close 동일가중). `GET /category/cumulative-daily` → 섹터별 일간 동일가중 지수 누적%(~200일, 공통 윈도우 `min_len=150`). `GET /coins` → `CoinStat[]`(변동성·1개월수익률·베타 등). `GET /correlation/{market}` → 일간 수익률 피어슨 상관 내림차순(공통 관측 40일 미만 제외). `GET /advance-decline` → A-D 라인(거래대금 상위 100종 상승−하락 누적 + 동일가중 지수).

### Backtest — `/api/backtest`
- `ma-cross`(`fast`/`slow`/`count`/`fee_bps`/`target_vol`) — 직전 완결봉 크로스 판정 후 당일 종가 체결(룩어헤드 제거). `rsi`(Wilder 평활, `period`/`oversold`/`overbought`). 둘 다 거래비용 + **유동성 기반 슬리피지** + 두 벤치마크(같은 종목/BTC 매수보유). `compare` — MA·RSI 겹쳐보기. `walk-forward` — in-sample 그리드서치 → OOS 집계 + **다중검정 과최적화 p값**. `montecarlo` — 일간수익률 부트스트랩 부채꼴(백분위 밴드·손실확률). `tsmom` — 시계열 모멘텀(12-1 skip·국면필터·변동성 타게팅·히스테리시스). `portfolio` — 가중 보유 + 선택적 리밸런스.
- 리스크 조정 지표: `sharpe`=(평균/표준편차)×√365, `sortino`=하방 표준편차만, `calmar`=연율화수익/(MDD/100).

### Quant — `/api/quant` (일봉 공용 캐시 재사용 → 추가 팬아웃 0, 좌표 `(vol x, ret y)` %)
- `portfolio`(`markets` 2~8) → 무작위 1000 시뮬(Dirichlet α=0.3) + 효율적 경계선 60점(각 점 `weights`) + ★최대샤프/◆최소분산/▲리스크패리티 + 리스크 기여도 + Ledoit-Wolf 수축 + 상관행렬.
- `network`(MST, networkx) · `pca`(PC1=시장요인 설명비율) · `clusters`(K-means) · `dendrogram`(scipy 좌표) · `garch/{market}`(조건부변동성·예측·정규/경험 VaR·CVaR·지속성) · `momentum`(±`long_only`, 달러중립 롱숏/현물 롱온리) · `pairs`(공적분 + BH-FDR + **형성/거래기간 OOS 2-leg PnL** + 최우수 페어 상세) · `regime`(HMM 국면).

### Trends — `/api/trends` (업비트 '코인동향' 미러, 외부 실패 시 `error` 필드 노출)
- `indices`(자체 동일가중 시장지수 6종 + 60분봉 당일/전일 인트라데이) · `asset-indices`(시장·전략·테마·섹터) · `volume-power`(체결강도 = 매수/매도×100, WS `acc_ask/bid_volume` 1회 스냅샷) · `period-returns`(1w~1y + CoinGecko 시총) · `brief`(자체 시황 + 시총 도미넌스) · `fx`(현재가 open.er-api + 추이 frankfurter.dev) · `news`(한국 크립토 RSS) · `fear-greed`(alternative.me).

### WebSocket — `/ws`
- `WS /ws/tickers` — 전체 현재가. 백엔드는 업비트 ticker WS **1개**만 열어 fan-out(`TickerHub`), 신규 연결 시 최신 스냅샷 즉시 푸시. 메시지 `{market, trade_price, change, change_rate, change_price, acc_trade_price_24h}`.
- `WS /ws/market/{market}` — 종목 호가/체결(on-demand). `{type:"orderbook", asks[], bids[]}` · `{type:"trade", timestamp(초), price, volume, side}`.

</details>

<details>
<summary><b>주요 스키마(DTO)</b></summary>

- **Ticker**: `market`·`korean_name`·`trade_price`·`change`(RISE|FALL|EVEN)·`change_rate`(부호 소수)·`change_price`·`acc_trade_price_24h`·`high/low_price`·`prev_closing_price`·`sparkline[]`·`is_52w_high/low`(오늘 KST 경신 여부)·`w52_high/low`.
- **MarketSummary**: `total_volume`·`up_count`·`down_count`·`btc_dominance`(%).
- **Orderbook**: `market`·`asks[]`·`bids[]` (각 `{price, size}`).
- **Trade**: `timestamp`(초)·`price`·`volume`·`side`(BID|ASK).
- **CandleItem**: `timestamp`(ms)·`open/high/low/close`·`volume`.
- **CategoryReturns**: `categories[]`(섹터명, 가변)·`rows[]`(`{label, <섹터명>: 수익률%}`).
- **CoinStat**: `market`·`korean_name`·`category`(한글, null 가능)·`volatility`(30일 %)·`return_1m`(%)·`acc_trade_price_24h`.
- **CorrelationItem**: `market`·`korean_name`·`correlation`(-1~1).
- **BacktestResult**: `equity[]`(EquityPoint: `time`초·`value`·`benchmark`·`benchmark_btc`, 모두 100 시작)·`trades[]`(`time`·`side`·`price`·`pnl`%)·`metrics`(`total_return`·`benchmark_return`·`benchmark_btc_return`·`fee_bps`·`mdd`·`win_rate`·`trade_count`·`sharpe`·`sortino`·`calmar`).

</details>

---

## 프로젝트 구조

<details>
<summary><b>디렉터리 트리</b></summary>

```
up-quant/
├── backend/                          # FastAPI 서버
│   ├── app/
│   │   ├── main.py                   # 진입점 · CORS(env) · 로깅 미들웨어 · 부팅 프리페치 · WS 허브(TickerHub) · /health
│   │   ├── core/
│   │   │   ├── config.py             # 환경설정 · 마켓 유니버스/카테고리 · 캐시 TTL
│   │   │   ├── cache.py              # 인메모리 TTL 캐시 (SWR · single-flight · LRU)
│   │   │   ├── logging.py            # 요청 ID(rid) contextvar + 공통 로깅 포맷
│   │   │   ├── metrics.py            # 자체 관측성 메트릭
│   │   │   ├── security.py           # OAuth2+JWT(PyJWT·bcrypt) · current_user · WS 단발 티켓
│   │   │   └── ratelimit.py          # IP 토큰버킷 · 로그인 brute-force 잠금
│   │   ├── clients/upbit_rest.py     # 업비트 REST (httpx · 스로틀 · 429 재시도 · event_hook 로깅)
│   │   ├── data/upbit_sectors.json   # 데이터랩 '코인 분류' 스크랩 스냅샷
│   │   ├── routers/                  # HTTP 엔드포인트 (≈ @RestController)
│   │   │   └── auth · markets · candles · analysis · backtest · quant · report · system · trends · signals
│   │   ├── services/                 # 비즈니스 로직 + 캐싱 (≈ @Service)
│   │   │   ├── market_service · candle_service · analysis_service
│   │   │   ├── backtest_service · quant_service          # 백테스트 7종 · 정량 9종
│   │   │   ├── trends_service · fx_service · news_service · marketcap_service · fng_service
│   │   │   └── signal_service · report_service
│   │   └── schemas/                  # Pydantic 응답 모델(DTO)
│   ├── tests/                        # pytest 43 (수치·캐시·설정·라우터·개선·퀀트)
│   └── requirements.txt
├── frontend/                         # React + Vite SPA (전 소스 TypeScript)
│   ├── src/
│   │   ├── main.tsx · App.tsx · config.ts · index.css · theme.ts · types.ts
│   │   ├── api/                      # axios 호출 래퍼 (client + 도메인별)
│   │   ├── hooks/                    # 데이터 페칭 훅 (react-query 백킹 · error/retry)
│   │   ├── contexts/                 # Auth(쿠키 JWT) · Realtime(WS store) · PriceAlerts
│   │   ├── components/               # ui/ · layout/(Header·Footer·Layout) · LiveCells · ReportModal · ...
│   │   ├── utils/                    # chartExport · csv · format · popup
│   │   └── pages/                    # 라우트별 페이지 (Login · CoinList · Dashboard · Explore · Analysis · Tools · ...)
│   ├── .env.example · index.html · tsconfig.json · package.json
├── .github/
│   ├── deploy/                       # EC2 부트스트랩 · systemd · nginx 설정
│   └── workflows/                    # ci-/cd- frontend·backend (4 워크플로)
├── images/                           # README 스크린샷
└── README.md
```

</details>

---

## 설계 노트

| 항목 | 선택 | 사유 |
|------|------|------|
| 데이터 소스 | 업비트 시세 REST + WebSocket · 인증 불필요 | 계정/거래 권한 없이 시세만 사용 |
| 인증/보안 | OAuth2+JWT(HttpOnly·SameSite 쿠키) · IP 레이트리밋 · 로그인 brute-force 잠금 · WS 단발 티켓 | 모든 `/api`·`/ws` 보호. 엣지(WAF)가 1차 방어선, 앱은 backstop |
| 캐싱 | 인메모리 TTL + stale-while-revalidate + single-flight | 만료 시에도 옛 값 즉시 응답, 갱신은 백그라운드 1스레드(콜드·스탬피드 회피) |
| 일봉 캐시 통합 | 종목별 200개 1회 fetch 후 슬라이스 공유 | 스파크라인·통계·상관·정량분석이 캔들 재호출 없음 (상관관계 ~1800ms → ~5ms) |
| 캐시 워밍 | 부팅 시 **동기** 프리페치 후 기동 | 기동 느려지는 대신 첫 사용자도 콜드 없음. 대량 팬아웃은 기동 1회만 |
| 실시간 중계 | 업비트 ticker WS **1개**를 fan-out하는 공유 허브 | 클라이언트마다 연결을 새로 열면 N배로 늘어 비효율 (팬아웃 원칙의 WS판) |
| 프론트 실시간 구독 | 외부 store + `useSyncExternalStore` 종목별 selector | 261종 고빈도 갱신 시 Context 전체구독은 리렌더 폭주 → 바뀐 셀만 리렌더 |
| 관측성 | `contextvars` 기반 rid를 3계층 로그에 주입 + `X-Request-Id` | Spring MDC처럼 요청 전 구간 추적 |
| 마켓 유니버스 | 분석은 KRW 전체(~261종) | `/market/all` 교집합으로 상장폐지 자동 제외 |
| 정량 분석 | 통계/ML은 검증된 라이브러리, 일봉은 공용 캐시 재사용 | 직접구현 정체성은 인프라 계층에. 추가 팬아웃 0 |
| 에러 UX | 실패 시 빈 화면 대신 "다시 시도" 게이트 (`useFetch`·`PageError`) | 조용한 실패 제거 |
| TLS(WebSocket) | `websockets` 연결에 certifi 기반 SSL 컨텍스트 명시 | 환경(특히 macOS 프레임워크 Python) 비의존 |
| 색상 컨벤션 | 상승 = 빨강 / 하락 = 파랑, 액센트 = 업비트 블루(`#1763b6`) | 한국 금융 UI 관행 + 업비트 톤 |

<details>
<summary><b>캐시 동작 (TTL · stale-while-revalidate)</b></summary>

모든 업비트 REST 호출은 예외 없이 `cached(key, ttl, fetch)` 한 곳을 거칩니다. **"무거운 것만 캐싱"이 아니라, 전부 캐싱하되 TTL만 다릅니다.** (실시간성이 필요한 현재가·호가·체결은 WebSocket으로 별도 갱신)

| 데이터 | TTL | 만료 시 fan-out |
|--------|-----|-----------------|
| 현재가(ticker, 조립 결과 캐시) | 5s | 1콜 (전 종목 일괄) |
| 호가 · 체결 | 3s | 1콜 |
| 분봉(1~30분, 인트라데이) | 30s | 1콜 |
| 60·240분봉 (인트라데이 지수·라이브 차트) | 300s | 1콜 |
| 스파크라인 (1시간봉, 전 종목) | 1800s | 261콜(부팅 1회) |
| 일봉 (통계·정량분석 공용, canonical 200) | 3600s | 261콜 |
| 주봉·월봉 (canonical, 집계 공용) | 1800s | 261콜 |
| 외부 소스(환율·뉴스·시총·도미넌스·F&G) | 성공 600~21600s / **에러 60s** | 1콜 |
| 마켓목록 · 한글명 | 3600s | 1콜 |

**SWR 3상태**: 신선(즉시 반환) / stale(옛 값 즉시 반환 + 백그라운드 1스레드 갱신, single-flight) / 콜드(없음, 동기 fetch). 읽기는 락-프리, 쓰기 시에만 LRU `move_to_end`(상한 20k, 핫 키 축출 방지). **callable TTL**로 외부 소스 성공은 길게·에러는 60초만 캐시.

**레이트리밋 + 포그라운드 우선**: `upbit_rest`에 전역 스로틀(~초당 8회) + 429 백오프. 백그라운드 워밍/재검증(스레드명 `cache-revalidate`/`periodic-warm`)은 직렬화 + 포그라운드 대기 시 양보, 사용자 요청은 다음 슬롯만 대기.

</details>

---

## 엔지니어링 의사결정 기록

> 이 프로젝트를 만들며 내린 기술적 판단의 회고입니다. 단순 작업 목록이 아니라 **"어떤 고민이 있었고, 어떤 후보를 두고, 무엇을 왜 골랐는가"** 를 남기는 데 목적이 있습니다.

<details>
<summary><b>① 캐싱 · 성능 · 콜드스타트</b></summary>

- **SWR + single-flight** — 단순 TTL은 만료 순간 지연·스탬피드를 노출한다. 만료돼도 옛 값을 즉시 반환하고 갱신은 키별 락으로 한 스레드만. *시세는 수 초 stale 허용 가능한 도메인이라 가능한 선택*(강한 일관성이면 부적절).
- **콜드스타트를 "기동/최초 사용자/매 사용자"로 분리** — 캐시가 프로세스 전역이라 "매 사용자"는 아니다. 느린 건 캐시 빈 동안의 초기 사용자뿐 → **동기 프리페치(워밍 후 기동)**로 첫 사용자도 콜드 제거(기동 1~2분 감수).
- **워밍 범위 = 주요 진입 화면만** — 전부 워밍하면 수천 콜(레이트리밋에 8~15분), 게다가 호가·체결은 TTL이 짧아 미리 받아도 만료 → 실익 0. *"전부 캐싱"은 비용 대비 실익이 없다*가 핵심 판단.
- **일봉 캐시 통합** — 변동성·수익률·상관이 같은 일봉을 중복 요청(~1800ms). 종목별 200개 1회 fetch 후 슬라이스 공유 → ~5ms. *"구간이 다르다"와 "원본이 다르다"를 분리.*
- **카테고리 캐시 + 부팅 워밍** — 섹터 집계(261종 월봉)는 콜드 ~1분. monthly가 series를 만들면 cumulative가 재사용 → fetch 1회. *새 무거운 집계를 추가하면 프리페치 워밍 범위도 함께 갱신해야 한다.*
- **캐시 LRU — "읽기 락-프리"를 깨지 않는 축출** — 진짜 LRU는 읽을 때마다 꼬리로 옮겨야 하지만 그러면 핫패스(읽기) 무락 장점을 버린다. 쓰기 시에만 `move_to_end`하는 절충(stale 재검증이 곧 접근이라 "접근 기반 LRU"에 근사). *자료구조 교체는 기존 성능 불변식을 먼저 적고 그걸 안 깨는 선에서.*
- **캐시 TTL 미스매치** — 일봉은 canonical+장기 TTL인데 월봉/주봉은 분봉과 같은 30s로 방치 → 이를 소비하는 집계가 재검증마다 261종 월봉을 콜드로 다시 받았다. *하위 캔들 TTL은 그것을 소비하는 집계 TTL 이상이거나 canonical이어야 한다.*
- **"페이지 이동마다 다시 느려진다" — 범인은 전역 스로틀을 점유한 백그라운드** — 전역 스로틀은 하나의 줄이라, 백그라운드 워밍이 261종 팬아웃을 쏟으면 포그라운드가 ~31초 줄선다. 역설적으로 콜드를 줄이려 넣은 주기 워머가 이 현상을 규칙적으로 만들었다 → **포그라운드 우선 스로틀**(백그라운드 양보). *백그라운드 최적화가 공유 자원을 통해 포그라운드를 굶길 수 있다.*

</details>

<details>
<summary><b>② 데이터 한계의 돌파 — "불가"는 "내가 아는 엔드포인트로는 불가"였다</b></summary>

- **분석 유니버스 — 큐레이션 15종 vs 마켓 전체** — 전체(~261종) 선택. 상장폐지는 `/market/all` 교집합으로 자동 제외, 팬아웃은 TTL을 길게. 카테고리 매핑은 "있으면 부여, 없으면 None"으로 전체 확장과 분리.
- **정렬 기준 — 거래대금 vs 시총 vs 현재가** — 현재가는 메이저함과 무관, 시총은 *업비트 ticker가 제공 안 함*(확인). → 거래대금 내림차순(거래소 기본과 동일), 백엔드 한 곳에서 정렬해 전 화면 정합. *"메이저 순"이라는 모호한 요구를 척도로 번역하고, 그 척도가 데이터로 가능한지부터 확인.*
- **코인 분류 — 공식 API가 없을 때 긁어오기** — `datalab-api`는 일괄 400. 대신 `/sector` 페이지의 **Next.js RSC 페이로드**에 prefetch된 261종 분류가 인라인 → 정규식 추출해 정적 JSON. *"공식 API가 없다 ≠ 데이터가 없다." 404(없음) vs 400(있으나 요청오류)을 구분해 엔드포인트 존재를 확인.*
- **섹터 수익률 집계 — 동일가중** — 시총가중이 이상적이나 실시간 시총이 없다 → 동일가중 단순평균("섹터 평균 종목의 수익률"로 해석 명확). *이상적 방법과 가진 데이터로 가능한 방법을 분리.*
- **체결강도 · 인트라데이 · 시총** — "데이터 한계로 불가"를 사용자가 거부 → 직접 probe. 체결강도는 REST엔 없지만 **WS 티커에 `acc_ask/bid_volume`가 있었고**, 인트라데이는 60분봉으로 자체 지수 구성, 시총은 CoinGecko 무료 API로 우회. *"데이터가 없다"고 단정하기 전에 소스를 직접 두드려본다.*
- **환율 추이 차트** — open.er-api는 현재가만 준다 → 추이는 **frankfurter.dev 시계열**(소스 2개 공존). `.app`이 301로 폐기돼 파라미터 유실되던 것을 원응답을 직접 찍어 발견. *한 위젯이 두 성격(현재값·추이)을 요구하면 역할별로 소스를 나눠라.*
- **죽은 RSS는 "에러"가 아니라 "HTML"로 죽는다** — `not well-formed` 에러의 진짜 원인은 폐기된 피드가 HTML 홈페이지를 반환한 것. HTML 응답 가드 + 살아있는 피드로 교체. *외부 피드 실패는 "포맷이 깨졌나"보다 "응답 자체가 그 포맷이 맞나"를 먼저 의심.*

</details>

<details>
<summary><b>③ 퀀트 정확성 · 정직성 — 숫자를 못 믿으면 안 쓴다</b></summary>

- **라이브러리 도입 + "예측 함정" 회피** — 공분산 역행렬·MLE·공적분·HMM을 직접 짜는 건 무가치(검증된 구현 존재). *정체성은 인프라 계층에, 통계/ML은 라이브러리.* OHLCV만으로 가격 예측 classifier는 룩어헤드·과적합으로 면접 방어 불가 → **예측보다 구조·리스크 분석**(포트폴리오·요인·변동성·팩터·국면)으로 방향 고정.
- **모델이 "돌아간다 ≠ 의미 있다"** — HMM이 수익률 단일 피처로는 199일 중 195회 과전환 → 롤링 변동성 피처 추가로 9회 안정. PCA PC1에 USDT 음수 로딩(스테이블이 시장과 무관함을 데이터가 스스로 드러냄). *전환 횟수·로딩 부호 같은 현실성 점검을 실측으로.*
- **상관 = 가격 레벨 피어슨이었다(명백한 오류)** — 종가끼리 피어슨은 둘 다 추세면 무조건 높다(허위상관). 같은 레포의 network/PCA는 수익률로 올바른데 코인상세 상관만 레거시 → 일간 수익률로 통일. *"한 곳만 틀린 일관성 결함"은 전수 검토라야 잡힌다.*
- **페어 — FDR · 2-leg PnL · 룩어헤드** — 수백 페어를 α=0.05로 개별검정하면서 백테스트엔 다중검정 보정을 넣은 비대칭 → BH-FDR. 검증수익을 로그스프레드 프록시 → 실제 (자산1−β·자산2) 2-leg PnL. 헤지비율 β를 전 구간 OLS로 적합하던 룩어헤드 → 형성기간(앞50%) 추정 → 거래기간(뒤50%) OOS.
- **돈을 버는 레버는 새 알파가 아니다** — 시장은 거의 효율적이라 새 지표 효과는 작다. 실현 P&L을 움직이는 순서: ①백테스트 정직화(슬리피지·다중검정) ②리스크 기반 사이징(변동성 타게팅·CVaR) ③국면 인지(크래시 회피). TSMOM에 국면필터를 넣자 하락장 MDD 34.8%→11.8%(같은 신호, 위험 인지 사이징만으로).
- **모멘텀 크래시 필터 — HMM을 "쓰고 싶었지만" causal proxy를 택함** — `_compute_regime`은 전 윈도우 적합이라 게이트로 쓰면 look-ahead. 인과적 프록시(그 시점까지의 추세·변동성)로 대체. *이미 만든 자산 재활용 유혹과 백테스트 인과성이 충돌하면 인과성이 우선.*
- **방법론 라벨/정의 정합** — RSI Wilder 평활(단순평균 RSI는 표준 도구와 값이 다름), 도미넌스=시총 기준(거래대금 비중을 "도미넌스"라 부르던 것), 실제 F&G 연동. *퀀트는 라벨과 정의 불일치를 바로 알아챈다 → 정직한 라벨이 곧 신뢰.*
- **신뢰성 경고 — "정직함"과 "보기 싫음"** — Caveat 박스를 넣었다 뺐다 반복하다, 사용자가 일관되게 제거를 택함. 결론: **경고문 대신 검증 기능**(워크포워드·전략비교·BTC 벤치마크)으로 한계를 내장. OOS 곡선이 무너지는 걸 눈으로 보는 게 "주의" 한 줄보다 정직하고 덜 거슬린다.
- **AI 리포트 — 자동초안(stub) 폐기** — 실패 시 그럴듯한 폴백은 정직성을 해친다 → 키 없음·실패·빈 응답이면 502로 오류 전파(실패는 캐시 안 함). 503(일시 과부하)만 3회 백오프 재시도(429 쿼터 폴백 모델은 같은 키라 무의미해 제거). *폴백은 "다른 실패 모드"여야 의미 있다.*

</details>

<details>
<summary><b>④ 실시간 아키텍처 — "팬아웃 원칙"의 두 번째 적용</b></summary>

- **공유 허브 + 종목별 selector** — 실시간화 시 두 군데 "N배 폭증" 위험: 서버(클라이언트마다 업비트 WS 연결)·프론트(261종 고빈도 갱신을 Context로 구독하면 전 셀 리렌더). → 양쪽 다 "공유 + 선택구독": 서버는 업비트 WS **1개**를 fan-out하는 허브(캐시의 "팬아웃 1회 후 공유" 원칙의 WS판), 프론트는 외부 store + `useSyncExternalStore` 종목별 selector(+300ms 배치).
- **왜 Context가 아니라 외부 store인가** — Context는 값이 바뀌면 전 consumer 리렌더 → "전체 prices 맵"을 value로 두면 종목별 구독 불가. `useSyncExternalStore`는 `getSnapshot`을 종목별로 좁혀 "내 종목 값이 그대로면 리렌더 안 함"을 보장. *고빈도·고카디널리티 실시간은 Context의 안티패턴, 외부 store가 정석.*

</details>

<details>
<summary><b>⑤ 프론트엔드 함정 — 빌드는 통과하고 런타임에서만 터진다</b></summary>

- **`set-state-in-effect` 5건** — `useEffect`에서 `setLoading(true)`를 부르면 매 렌더마다 추가 렌더. `loading`을 state로 들지 말고 `loadedKey !== currentKey` **파생값**으로. 부수로 cancellation(빠른 토글 시 늦은 응답이 덮어쓰는 race)도 함께 잡힘. *린트 규칙은 종종 진짜 설계 결함을 가린다 — 막지 말고 들여다볼 것.*
- **Tailwind v4 `@import` 펼침이 외부 CSS `@import`를 죽임** — `@import "tailwindcss"`가 빌드 시 수천 줄을 인라인 펼쳐 Pretendard `@import`가 뒤로 밀려 무시됨 → **폰트가 실제로 로드 안 되고 있었다**. HTML `<link>`로 이동. *빌드 경고는 "스타일 차이"가 아니라 "기능 미작동"일 수 있다. 렌더 결과 ≠ 소스 순서.*
- **lightweight-charts v4→v5 — RSI 클릭에 전체 화면이 사라짐** — `getSeries()`가 `IChartApi`→`IPaneApi`로 소속 이동(빌드 통과, 런타임 TypeError). 에러 바운더리가 없어 트리 전체 언마운트(흰 화면). + StrictMode 더블마운트 시 ref에 남은 죽은 시리즈. *메이저 업글은 API의 소속(계층)이 조용히 이동한다. 에러 바운더리는 선택이 아니라 필수.*
- **코인리스트가 줌 아웃에 끝없이 길어짐** — grid row 높이는 셀의 자연 높이 max로 정해지는데 우측 리스트(261행)가 이를 키움. CSS만으론 형제 높이 참조 불가 → wrapper + `absolute inset-0`(absolute 자식은 부모 높이에 기여 안 함). *CSS 레이아웃 버그를 추론으로 두 번 틀렸으면 세 번째는 추론 말고 실제로 띄워 재현했어야 했다.*
- **좌우 컬럼 높이 맞추기 — 행수 늘리기 vs `justify-between`** — "콘텐츠 양으로 높이 맞추기"는 끝없는 추측 → `items-stretch` + `flex justify-between`으로 자동 균등 분배. *데이터는 그때그때 변하니 레이아웃으로 맞춰라.*
- **전면 TypeScript + strict** — 점진 strict로 전 파일 전환해 빌드 먼저 그린 후 강화. strict "켜짐"과 "잘 타입됨"은 다름 — 기계적 `any` 블랭킷은 형식만 통과. 진짜 가치는 **데이터 계약**(스키마→타입→api→hooks→props), 거기까지 가면 남은 `any`(라이브러리 경계)는 더 좁히는 게 한계효용 낮거나 역효과. *경계에선 정직한 any가 가짜 정밀보다 낫다.* (교훈: 대규모 rename은 기능 작업과 같은 세션에 섞으면 커밋을 기능별로 못 쪼갠다 — 독립 커밋으로 먼저.)

</details>

<details>
<summary><b>⑥ IA · UX — 막연한 인상을 관찰 가능한 속성으로 분해</b></summary>

- **리스크-수익 산점도** — 극단값 때문에 본체가 한구석에 뭉침 → IQR 펜스 안(본체)만 산점도 + 극단값은 별도 표. *"버리지 않되 분포를 가리지 않게."*
- **52주 신고/신저가 — "정확히 일치" 조건의 함정** — `price >= w52_high`는 전수 0개(찍는 순간에만 참). 업비트가 주는 달성일(`highest_52_week_date`)이 오늘인지로 변경. *표면 증상을 전수 검증해 근본 원인을 찾고, 가진 데이터를 다시 봤더니 답이 있었다.*
- **52주 배지 노출 범위 — "데이터가 맞다"와 "보여줄 가치가 있다"는 다르다** — 하락장에 잡코인 신저가 수십 개는 노이즈 → 판정은 전 종목, 노출만 거래대금 상위 30종. *신호/노이즈 비를 기준으로 노출 범위를 정하는 게 UX.*
- **"업비트 같지 않다"의 정체** — 막연한 "분위기"를 항목별로 대조: 정체는 보라빛 indigo 액센트 + 색 가짓수 과다. → 업비트 블루로 통일, 구분색 절제. 단 "색을 줄인다 ≠ 단색화"(5섹터 라인이 다 파란 농담이면 못 쓴다), 의미색(상승/하락)은 안 건드림. *막연한 미감 불만은 관찰 가능한 속성으로 분해해야 작업 가능하다.*
- **누적수익률 툴팁 — 스냅 vs 보간, 그리고 월봉→일봉** — "보간은 가짜값"이라는 단정은 절반만 맞다(곡선 스무딩 중간값 vs 선형 직선상 값). 더 나은 답은 **데이터 해상도를 올리는 것**(월봉 12점→일봉, 공용 캐시라 추가 호출 0). 단 해상도는 조망 범위(5년)와 트레이드오프. *시각 표현과 수치 정의를 일치시켜라.*
- **상관 히트맵이 "다 같은 색"** — 크립토는 실제로 강하게 동조(0.8~0.95)라 고정 임계값에선 한 칸에 몰림 → 동적 상대 스케일(대각선 제외, 관측 범위에 매핑), 숫자는 그대로. 색 의미가 "절대 강도"→"이 표 안 상대 강도"로 바뀜(캡션 명시).
- **IA "난잡함"의 정체** — 전 페이지 요소를 전수 표로 깔자 원인이 드러남: 대시보드↔마켓 중복, 대시보드 과적재, 헤더 위계 부재. 탭을 줄이는 대신 **그룹으로 위계**(빈약 우려와 양립). 그래도 휑한 건 focal point 부재 → 전폭 히어로 차트. *"휑하다"의 해법은 위젯을 늘리는 게 아니라 크기 위계를 만드는 것.* (이후 대시보드는 업비트 "코인동향" 미러로 전면 재편 — 중복 제거 + 발견·지수 중심.)
- **헤더 라벨 — 영어↔한글, 그리고 "구조는 맞는데 안 보인다"** — 영어화(전문 톤)→한글화(국내 관행). 더 중요한 발견: 그룹 논리는 타당한데 의도가 화면에 안 드러나서(파이프만, 라벨 없음) 헷갈림. *"이 구조 맞아?"는 종종 구조가 틀린 게 아니라 구조가 안 보이는 것.*
- **효율적 경계선 "원 뭉침" — 정상과 개선의 경계** — 수치로 분해: ⑴자산이 (vol,ret) 평면에 좁게 몰림(데이터 진실) ⑵Dirichlet 균등샘플이 중심 집중(개선 가능). 진짜 해결은 **곡선을 그리는 것**(곡선 vol이 개별 최저보다 낮아 분산효과가 드러남). *무작위 구름은 분포를, 곡선은 "최적의 경계"를 보여준다.*
- **시장 구조 2분리 — "관계(미시)"와 "국면(거시)"** — "길어서"가 아니라 "다른 질문을 하는가"로 가름: 종목 간 관계(네트워크·군집) vs 시장 전체 상태(PCA·HMM).
- **분석 카트 — "흐름의 척추"라 정당화했으나 결국 제거** — 종목을 페이지 간 전달하는 전역 카트를 만들었다가, 그 흐름이 각 페이지 자체 UI로도 흐르고 즐겨찾기(★)와 중복으로 느껴져 제거. *설계 의도의 명료함 ≠ 사용자 체감.*
- **로그인 배경 — plain을 고른 이유** — "떠다니는 비트코인 와이어프레임"은 크립토 클리셰(퀀트/분석을 말 안 함). 실물 프리뷰를 만들어 비교하게 함 → plain 선택. *디자인 갈림길의 "잘 모르겠다"엔 말 대신 프리뷰. 예쁨 ≠ 온브랜드.*
- **라우트 `/그룹/페이지` 일관화** — 그룹명 = 경로 prefix(`market`·`research`·`strategy`), 옛 경로는 전부 리다이렉트. *URL은 IA의 일부 — 라벨↔슬러그 대응이 어긋나면 사용자가 알아챈다.* (내가 "8항목 한 드롭다운"이라 반대했으나 사용자가 말한 건 "별도 드롭다운 4·3"이었다 — 사용자 제안을 내 가정으로 재단하지 말 것.)

</details>

<details>
<summary><b>⑦ 관측성 · 운영 · 배포 — 로컬 단일 머신에선 안 보이던 가정들</b></summary>

- **관측성 — 외부 APM vs 직접 구현한 rid** — OpenTelemetry는 POC엔 과함 → `contextvars` 기반 rid를 axios·미들웨어·httpx event_hook에 주입(`X-Request-Id` 전파). 실무의 Spring MDC를 표준 라이브러리로.
- **WS SSL 인증서 — "REST는 되는데 WS만 죽는다"** — macOS 프레임워크 Python의 기본 CA가 깨진 심링크(certifi 미설치) → `ssl.create_default_context()`가 CA 0개. httpx는 자체 certifi라 무사했던 게 단서. "머신을 고친다" vs "코드에서 certifi 명시" 중 후자(환경 비의존). *"내 머신이 이상한 것"이라도 코드로 못 박을 수 있으면 그게 이식성이다.*
- **환경변수화 — "설정은 있는데 안 쓴다"는 더 나쁘다** — `cors_origins` 필드가 있는데 main은 하드코딩(죽은 설정). pydantic-settings가 `list[str]`을 JSON 선파싱해 CSV가 죽던 것을 `NoDecode`로 끔. *라이브러리의 "똑똑한 기본 동작"이 의도와 충돌하면 그 동작을 끄는 명시 어노테이션을 찾는 게 깨끗하다.*
- **조용한 실패 → 재시도 UI** — `.catch` 없는 훅이 API 죽으면 빈 화면(ErrorBoundary는 렌더 예외만 잡음) → 공용 `useFetch`(`{data,loading,error,retry}`). *공용 추상화로 묶을 때 호출부 계약(반환 키)은 그대로 둬야 한다.*
- **서버 고아 프로세스 — kill-port가 못 잡는 reload worker** — `fastapi dev`(uvicorn `--reload`)의 worker 자식이 고아로 살아남아 포트 바인딩만 잃으면, 8000엔 아무것도 없는데 `_periodic_warm`이 계속 업비트를 친다. *`--reload`는 부모-자식 2프로세스 — "포트로 죽이기"는 자식이 고아가 되면 새는 추상화. 프로세스 트리를 죽여야 한다.*
- **체결강도 무한 행 — "전부 모을 때까지"가 종료조건이면 안 된다** — WS 수집 종료가 "263종 전부"뿐인데 일부는 `acc_ask_volume==0`이라 영영 안 옴 + 활발한 시장은 recv 타임아웃도 안 걸림 → 무한 수집. **deadline 4초** 추가. *외부 스트림 수집의 종료조건을 "전량 도착"에 걸지 마라 — 시간/개수 상한을 둔다.*
- **CloudFront 403 — 같은 버킷에 "공개 원본 + 비공개 정책"이 섞이면** — 원본이 S3 website 엔드포인트(공개)인데 버킷은 OAC(비공개) → OAC 서명은 REST에만 적용돼 403. `curl -I`의 `Server`·`x-amz-error-code`·`X-Cache` 헤더로 "누가 거부했나(CloudFront vs S3)"를 먼저 가름.
- **CI/CD — 한 워크플로 2잡 vs 4파일 분리** — `ci-*`(path필터·변경된 쪽만) → `cd-*`(`workflow_run`으로 CI 성공 시 이어받음). path 필터를 CI에 두면 CD가 변경 범위를 따라온다.
- **배포 운영의 비대칭** — ⑴uvicorn 단일 프로세스(인메모리 캐시·WS 허브가 프로세스 상태라 멀티워커 금지) ⑵`.env` 단일 소스(CD가 Secrets로 덮어쓰니 `AUTH_SECRET` 바뀌면 전원 로그아웃) ⑶헬스 게이트(`/health`의 `ready:true` 폴링해야 "배포 성공=서비스 준비"). *상태가 프로세스에 있는 서비스는 배포 파이프라인이 그 상태를 명시적으로 다뤄야 한다.*

</details>

<details>
<summary><b>⑧ 메타 — "지금 안 한 것"도 의사결정이다</b></summary>

- **Redis · WebSocket(초기 보류) · async httpx — 기대값으로 판단** — Redis는 단일 인스턴스 POC엔 과한 의존성(멀티 인스턴스화 시 도입 조건부). async httpx는 병목이 업비트 레이트리밋이라 빨라지지 않고 전계층 비동기화 리스크만 큼(기대값 음수) → "다 하라"는 지시에도 정직하게 제외하고 이유를 남김. *비용이 아니라 기대값으로 판단하고, 안 한 이유를 기록한다.*
- **부가기능 진입점 — 새 창 vs 헤더 탭** — 분리된 "도구 모음"이라는 개념적 깔끔함보다 발견성·즉시성이 우선이라 헤더 탭으로 환원(+진입 즉시 결과). *개념적 깔끔함보다 실사용 가치.*
- **"이미 성숙한" 서비스에서 무엇을 고칠 것인가** — 전수 리뷰의 가치는 새 기능이 아니라 ⑴한 곳만 틀린 일관성 결함 ⑵라벨/정의 불일치를 잡는 것. 둘 다 개별 작업 중엔 안 보이고 신뢰를 갉아먹는다.

</details>

---

> 본 프로젝트는 **공개 시세 데이터 기반의 분석·교육용 대시보드**이며, 투자 자문이나 매매 신호를 제공하지 않습니다. 백테스트·정량 분석 결과는 과거 데이터에 기반하며 미래 수익을 보장하지 않습니다.
