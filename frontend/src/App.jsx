import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AnalysisCartProvider } from './contexts/AnalysisCart'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Explore from './pages/Explore'
import CoinList from './pages/CoinList'
import Analysis from './pages/Analysis'
import Tools from './pages/Tools'
import Help from './pages/Help'

function App() {
  return (
    <BrowserRouter>
      <AnalysisCartProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          {/* 탐색 = 마켓현황·섹터·스크리너 통합(P2-1). 경로가 초기 서브탭을 결정(딥링크 호환) */}
          <Route path="/explore" element={<Explore />} />
          <Route path="/market" element={<Explore />} />
          <Route path="/sectors" element={<Explore />} />
          <Route path="/screener" element={<Explore />} />
          {/* /coins와 /coins/:market 모두 master-detail CoinList로 — market 없으면 디폴트 KRW-BTC */}
          <Route path="/coins" element={<CoinList />} />
          <Route path="/coins/:market" element={<CoinList />} />
          {/* 분석 = 관찰형(자동 분석) 허브 · 도구 = 설정형(종목/전략 선택). ?tab= 쿼리가 서브탭 */}
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/tools" element={<Tools />} />
          {/* 기존 경로 호환 리다이렉트 */}
          <Route path="/quant" element={<Navigate to="/analysis" replace />} />
          <Route path="/compare" element={<Navigate to="/tools?tab=compare" replace />} />
          <Route path="/backtest" element={<Navigate to="/tools?tab=backtest" replace />} />
        </Route>
        {/* 도움말만 새 창(window.open)으로 띄우므로 Layout(헤더) 밖 단독 렌더 */}
        <Route path="/help" element={<Help />} />
      </Routes>
      </AnalysisCartProvider>
    </BrowserRouter>
  )
}

export default App
