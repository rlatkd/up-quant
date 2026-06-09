import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'

// 전역 쿼리 캐시 — 같은 엔드포인트를 여러 컴포넌트가 호출해도 1회만 fetch(디둡)하고,
// 페이지를 떠났다 돌아와도 staleTime 내면 캐시에서 즉시 렌더(재요청 없음). 백엔드가 이미 SWR 캐시라
// 프론트 staleTime은 짧게 잡아 과한 staleness를 피한다(실시간 변동은 WS가 별도로 셀을 갱신).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,            // 60s 동안은 캐시를 신선으로 간주(재요청 안 함)
      gcTime: 5 * 60_000,           // 미사용 캐시 5분 후 수거
      refetchOnWindowFocus: false,  // 탭 포커스마다 재요청하지 않음(시세는 WS가 갱신)
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
