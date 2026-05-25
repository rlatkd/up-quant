import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Market from './pages/Market'
import CoinList from './pages/CoinList'
import CoinDetail from './pages/CoinDetail'
import ToolsHub from './pages/ToolsHub'
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
        </Route>
        {/* 도움말·부가기능(비교/백테스트/스크리너)은 새 창(window.open)으로 띄우므로 Layout(헤더) 밖 단독 렌더 */}
        <Route path="/help" element={<Help />} />
        <Route path="/tools" element={<ToolsHub />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
