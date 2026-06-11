import { lazy, Suspense, useEffect, type ReactNode } from 'react'
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

// 라우트 이동 시 스크롤을 최상단으로 초기화 — 스크롤을 내린 상태에서 다른 탭으로 이동해도
// 새 페이지는 맨 위에서 시작한다(SPA는 기본적으로 스크롤 위치가 유지됨).
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

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
      <ScrollToTop />
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedShell />}>
          {/* 코인 목록이 메인('/'·로고 클릭 시 진입). master-detail — market 없으면 디폴트 KRW-BTC */}
          <Route path="/" element={<CoinList />} />
          <Route path="/coins" element={<CoinList />} />
          <Route path="/coins/:market" element={<CoinList />} />
          {/* 시장 동향 — 헤더 단일 링크. 라벨('시장 동향')↔슬러그 /trends (마켓·리서치·전략과 동일 규칙) */}
          <Route path="/trends" element={<Dashboard />} />
          {/* 마켓 그룹 — /market/* (시장현황·섹터·스크리너·종목비교, 경로가 곧 화면) */}
          <Route path="/market" element={<Navigate to="/market/overview" replace />} />
          <Route path="/market/overview" element={<Explore />} />
          <Route path="/market/sectors" element={<Explore />} />
          <Route path="/market/screener" element={<Explore />} />
          <Route path="/market/compare" element={<ComparePage />} />
          {/* 리서치 그룹 — /research/* (시장구조·시장국면·팩터·리스크) */}
          <Route path="/research/structure" element={<Analysis />} />
          <Route path="/research/regime" element={<Analysis />} />
          <Route path="/research/factor" element={<Analysis />} />
          <Route path="/research/risk" element={<Analysis />} />
          {/* 전략 그룹 — /strategy/* (최적화 단일 + 백테스트/검증은 전략·기법별 하위 경로 = 헤더 드롭다운) */}
          <Route path="/strategy" element={<Navigate to="/strategy/portfolio" replace />} />
          <Route path="/strategy/portfolio" element={<PortfolioPage />} />
          <Route path="/strategy/backtest" element={<Navigate to="/strategy/backtest/ma" replace />} />
          <Route path="/strategy/backtest/:strategy" element={<BacktestPage />} />
          {/* 검증·시뮬레이션 — 3기법(전략비교·워크포워드·몬테카를로)을 한 페이지에 모아 표시(드롭다운 아님) */}
          <Route path="/strategy/validation" element={<ValidationPage />} />
          <Route path="/strategy/validation/:method" element={<Navigate to="/strategy/validation" replace />} />
          {/* 시스템 모니터링 (관측성) — 푸터 링크로 진입 */}
          <Route path="/system" element={<SystemMonitor />} />
          {/* 기존 경로 호환 리다이렉트 (그룹 prefix 도입 전 평탄 경로 + 옛 경로) */}
          <Route path="/overview" element={<Navigate to="/trends" replace />} />
          <Route path="/dashboard" element={<Navigate to="/trends" replace />} />
          <Route path="/explore" element={<Navigate to="/market/overview" replace />} />
          <Route path="/sectors" element={<Navigate to="/market/sectors" replace />} />
          <Route path="/screener" element={<Navigate to="/market/screener" replace />} />
          <Route path="/structure" element={<Navigate to="/research/structure" replace />} />
          <Route path="/regime" element={<Navigate to="/research/regime" replace />} />
          <Route path="/factor" element={<Navigate to="/research/factor" replace />} />
          <Route path="/risk" element={<Navigate to="/research/risk" replace />} />
          <Route path="/tools" element={<Navigate to="/strategy/portfolio" replace />} />
          <Route path="/tools/portfolio" element={<Navigate to="/strategy/portfolio" replace />} />
          <Route path="/tools/backtest" element={<Navigate to="/strategy/backtest" replace />} />
          <Route path="/tools/validation" element={<Navigate to="/strategy/validation" replace />} />
          <Route path="/tools/compare" element={<Navigate to="/market/compare" replace />} />
          <Route path="/research/compare" element={<Navigate to="/market/compare" replace />} />
          <Route path="/analysis/structure" element={<Navigate to="/research/structure" replace />} />
          <Route path="/analysis/factor" element={<Navigate to="/research/factor" replace />} />
          <Route path="/analysis" element={<Navigate to="/research/structure" replace />} />
          <Route path="/quant" element={<Navigate to="/research/structure" replace />} />
          <Route path="/compare" element={<Navigate to="/market/compare" replace />} />
          <Route path="/backtest" element={<Navigate to="/strategy/backtest" replace />} />
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
