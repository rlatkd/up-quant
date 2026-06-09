// API/WebSocket 베이스 URL — 환경 비의존화.
// 로컬 개발은 기본값(백엔드 :8000)으로 동작하고, 배포 시 .env의 VITE_API_BASE / VITE_WS_BASE로 주입한다.
// 예) VITE_API_BASE=https://api.upquant.app  VITE_WS_BASE=wss://api.upquant.app

export const API_BASE: string =
  import.meta.env.VITE_API_BASE || 'http://localhost:8000'

// WS_BASE를 따로 주지 않으면 API_BASE에서 http→ws(https→wss)로 유도한다.
export const WS_BASE: string =
  import.meta.env.VITE_WS_BASE || API_BASE.replace(/^http/, 'ws')
