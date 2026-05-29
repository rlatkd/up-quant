import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Market from './pages/Market'
import CoinList from './pages/CoinList'
import CoinDetail from './pages/CoinDetail'
import Sectors from './pages/Sectors'
import Compare from './pages/Compare'
import Backtest from './pages/Backtest'
import Screener from './pages/Screener'
import Help from './pages/Help'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/market" element={<Market />} />
          <Route path="/coins" element={<CoinList />} />
          <Route path="/coins/:market" element={<CoinDetail />} />
          <Route path="/sectors" element={<Sectors />} />
          {/* 부가기능 — 헤더 탭으로 노출, Layout(헤더) 안에서 렌더 */}
          <Route path="/compare" element={<Compare />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/screener" element={<Screener />} />
        </Route>
        {/* 도움말만 새 창(window.open)으로 띄우므로 Layout(헤더) 밖 단독 렌더 */}
        <Route path="/help" element={<Help />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
