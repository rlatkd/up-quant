# UPquant

업비트 KRW 마켓 암호화폐 분석 대시보드 (POC).

## 화면 구성

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/` | Dashboard | KPI · 카테고리 누적수익률 · 히트맵 · 리스크-수익 산점도 |
| `/market` | Market | 미니 차트 카드 · 상승률 테이블 · 트리맵 |
| `/coins` | CoinList | 시장 요약 · 코인 테이블 (스파크라인) |
| `/coins/:market` | CoinDetail | 캔들차트 · 호가창 · 체결내역 |

## 기술 스택

### Backend
- **FastAPI** — REST API 서버
- **httpx** — 업비트 REST 클라이언트 (async)
- **pydantic-settings** — 환경변수 관리

### Frontend
- **React 19 + Vite**
- **react-router-dom** — 클라이언트 사이드 라우팅
- **axios** — HTTP 클라이언트
- **recharts** — 분석 차트 (라인, 산점도, 트리맵, 스파크라인)
- **lightweight-charts v5** — 캔들차트
- **Tailwind CSS v4**

## 실행 방법

### Backend

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
fastapi dev app/main.py
```

→ http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm run dev
```

→ http://localhost:5173

## 프로젝트 구조

```
up-quant/
├── backend/
│   └── app/
│       ├── main.py
│       ├── core/          # 설정, 캐시
│       ├── clients/       # 업비트 API 클라이언트
│       ├── schemas/       # Pydantic DTO
│       ├── services/      # 비즈니스 로직
│       └── routers/       # HTTP 엔드포인트
├── frontend/
│   └── src/
│       ├── api/           # axios 호출
│       ├── hooks/         # 데이터 페칭 훅
│       ├── components/    # 공용 컴포넌트
│       └── pages/         # 라우트별 페이지
├── docs/                  # 세션 작업 로그
└── references/            # 기획서, 레퍼런스 이미지
```

## API 엔드포인트

```
GET /api/markets/tickers
GET /api/markets/tickers/{market}
GET /api/markets/summary
GET /api/markets/orderbook/{market}
GET /api/markets/trades/{market}
GET /api/candles/{market}?interval=days&count=60
GET /api/analysis/category/monthly
GET /api/analysis/category/cumulative
GET /api/analysis/coins
```

> 현재 전체 더미 데이터. `clients/upbit_rest.py` 교체로 실 API 전환 예정.
