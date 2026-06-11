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
      // 데이터가 천천히 변하고(일봉 파생) 라이브 가격은 WS가 따로 덧씌우므로, staleTime을 길게 잡아
      // 페이지를 옮길 때마다 백엔드를 다시 두드리지 않는다(백엔드 백그라운드 갱신 캐스케이드도 덜 깨움).
      staleTime: 5 * 60_000,        // 5분 — 이 안엔 재요청 안 함(즉시 캐시 렌더)
      // 페이지를 떠난 캐시를 오래 보관 → 한참 뒤 재방문해도 '옛 화면 즉시' 표시 후 백그라운드 갱신
      // (5분이면 떠났다 돌아올 때 캐시가 버려져 로딩이 떴음). 메모리보다 UX 우선.
      gcTime: 60 * 60_000,          // 1시간
      refetchOnWindowFocus: false,  // 탭 포커스마다 재요청하지 않음(시세는 WS가 갱신)
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
