import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { RealtimeProvider } from './contexts/Realtime'
import { PriceAlertProvider } from './contexts/PriceAlerts'
import { AuthProvider } from './contexts/Auth'
import { useAuth } from './contexts/useAuth'
import Layout from './components/layout/Layout'
import PageLoading from './components/ui/PageLoading'
import Login from './pages/Login'

// 라우트 기반 코드 스플리팅 — 무거운 페이지(recharts·lightweight-charts·d3-force·퀀트 차트)를
// 초기 번들에서 분리해 첫 로드를 가볍게. 각 페이지는 진입 시 청크가 lazy 로드된다.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Explore = lazy(() => import('./pages/Explore'))
const CoinList = lazy(() => import('./pages/CoinList'))
const Analysis = lazy(() => import('./pages/Analysis'))
const PortfolioPage = lazy(() => import('./pages/Tools').then(m => ({ default: m.PortfolioPage })))
const BacktestPage = lazy(() => import('./pages/Tools').then(m => ({ default: m.BacktestPage })))
const ValidationPage = lazy(() => import('./pages/Tools').then(m => ({ default: m.ValidationPage })))
const ComparePage = lazy(() => import('./pages/Tools').then(m => ({ default: m.ComparePage })))
const SystemMonitor = lazy(() => import('./pages/SystemMonitor'))
const Help = lazy(() => import('./pages/Help'))
const Guide = lazy(() => import('./pages/Guide'))

// 인증 가드 — 세션 확인 중엔 전체 로딩, 미인증이면 로그인으로(원래 가려던 경로 보존).
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, checking } = useAuth()
  const location = useLocation()
  if (checking) return <PageLoading />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

// 보호된 본문 셸 — 인증된 사용자에게만 실시간(WS)·알림 Provider와 Layout(헤더·푸터·Outlet)을 마운트.
// WS도 인증을 요구하므로 RealtimeProvider를 가드 안에 둔다(미인증 시 소켓 자체를 열지 않음).
function ProtectedShell() {
  return (
    <RequireAuth>
      <RealtimeProvider>
        <PriceAlertProvider>
          <Layout />
        </PriceAlertProvider>
      </RealtimeProvider>
    </RequireAuth>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedShell />}>
          {/* 코인 목록이 메인('/'·로고 클릭 시 진입). master-detail — market 없으면 디폴트 KRW-BTC */}
          <Route path="/" element={<CoinList />} />
          <Route path="/coins" element={<CoinList />} />
          <Route path="/coins/:market" element={<CoinList />} />
          {/* 대시보드는 별도 경로로 이동 */}
          <Route path="/dashboard" element={<Dashboard />} />
          {/* 탐색 = 마켓현황·섹터·스크리너. 경로가 곧 화면(딥링크 호환) */}
          <Route path="/explore" element={<Explore />} />
          <Route path="/market" element={<Explore />} />
          <Route path="/sectors" element={<Explore />} />
          <Route path="/screener" element={<Explore />} />
          {/* 시장 분석(관찰형) — 시장 구조(관계) / 시장 국면(거시) / 팩터 분석 (top-level 경로로 정리) */}
          <Route path="/structure" element={<Analysis />} />
          <Route path="/regime" element={<Analysis />} />
          <Route path="/factor" element={<Analysis />} />
          <Route path="/risk" element={<Analysis />} />
          {/* 전략 도구 = "서비스 더보기" 드롭다운의 독립 페이지 3종 */}
          <Route path="/tools" element={<Navigate to="/tools/portfolio" replace />} />
          <Route path="/tools/portfolio" element={<PortfolioPage />} />
          <Route path="/tools/backtest" element={<BacktestPage />} />
          <Route path="/tools/validation" element={<ValidationPage />} />
          <Route path="/tools/compare" element={<ComparePage />} />
          {/* 시스템 모니터링 (관측성) — 푸터 링크로 진입 */}
          <Route path="/system" element={<SystemMonitor />} />
          {/* 기존 경로 호환 리다이렉트 */}
          <Route path="/analysis/structure" element={<Navigate to="/structure" replace />} />
          <Route path="/analysis/factor" element={<Navigate to="/factor" replace />} />
          <Route path="/analysis" element={<Navigate to="/structure" replace />} />
          <Route path="/quant" element={<Navigate to="/structure" replace />} />
          <Route path="/compare" element={<Navigate to="/tools/compare" replace />} />
          <Route path="/backtest" element={<Navigate to="/tools/backtest" replace />} />
        </Route>
        {/* 도움말·분석 가이드는 새 창(window.open)으로 띄우므로 Layout(헤더) 밖 단독 렌더. 인증은 동일 적용 */}
        <Route path="/help" element={<RequireAuth><Help /></RequireAuth>} />
        <Route path="/guide" element={<RequireAuth><Guide /></RequireAuth>} />
      </Routes>
      </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
