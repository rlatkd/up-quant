import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AnalysisCartProvider } from './contexts/AnalysisCart'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Explore from './pages/Explore'
import CoinList from './pages/CoinList'
import QuantLab from './pages/QuantLab'
import Compare from './pages/Compare'
import Backtest from './pages/Backtest'
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
          {/* 퀀트 랩 — 헤더 별도 탭 (정량 분석 8종) */}
          <Route path="/quant" element={<QuantLab />} />
          {/* 분석 도구 — 헤더 더보기 드롭다운 */}
          <Route path="/compare" element={<Compare />} />
          <Route path="/backtest" element={<Backtest />} />
        </Route>
        {/* 도움말만 새 창(window.open)으로 띄우므로 Layout(헤더) 밖 단독 렌더 */}
        <Route path="/help" element={<Help />} />
      </Routes>
      </AnalysisCartProvider>
    </BrowserRouter>
  )
}

export default App
