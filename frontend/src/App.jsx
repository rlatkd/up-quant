import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Market from './pages/Market'
import CoinList from './pages/CoinList'
import CoinDetail from './pages/CoinDetail'
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
          <Route path="/compare" element={<Compare />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/screener" element={<Screener />} />
          <Route path="/help" element={<Help />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
