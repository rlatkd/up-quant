import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AnalysisCartProvider } from './contexts/AnalysisCart'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Market from './pages/Market'
import CoinList from './pages/CoinList'
import Sectors from './pages/Sectors'
import Compare from './pages/Compare'
import Backtest from './pages/Backtest'
import Screener from './pages/Screener'
import Help from './pages/Help'

function App() {
  return (
    <BrowserRouter>
      <AnalysisCartProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/market" element={<Market />} />
          {/* /coins와 /coins/:market 모두 master-detail CoinList로 — market 없으면 디폴트 KRW-BTC */}
          <Route path="/coins" element={<CoinList />} />
          <Route path="/coins/:market" element={<CoinList />} />
          <Route path="/sectors" element={<Sectors />} />
          {/* 부가기능 — 헤더 탭으로 노출, Layout(헤더) 안에서 렌더 */}
          <Route path="/compare" element={<Compare />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/screener" element={<Screener />} />
        </Route>
        {/* 도움말만 새 창(window.open)으로 띄우므로 Layout(헤더) 밖 단독 렌더 */}
        <Route path="/help" element={<Help />} />
      </Routes>
      </AnalysisCartProvider>
    </BrowserRouter>
  )
}

export default App
