import { useLocation, useNavigate } from 'react-router-dom'
import { PortfolioSection } from './Analysis'
import Backtest from './Backtest'
import Compare from './Compare'

// 전략 도구 — 헤더 "서비스 더보기" 드롭다운의 독립 페이지 3종.
// (과거 /tools 단일 페이지 + ?tab= 내부 탭 구조를 독립 라우트로 분리 — 드롭다운 구분 = 실제 페이지 구분.
//  내부 탭바는 제거해 이중 구조를 없앴다. 본문 최상단 제목도 제거 — 헤더 드롭다운이 위치를 보여줌.)

export function PortfolioPage() {
  const navigate = useNavigate()
  // 최적 비중(★최대샤프/◆최소분산)을 백테스트로 전달 — 독립 페이지라 navigate state로 넘긴다.
  const sendToBacktest = (payload) => navigate('/tools/backtest', { state: { preset: payload } })
  return <PortfolioSection onSend={sendToBacktest} />
}

export function BacktestPage() {
  const { state } = useLocation()
  return <Backtest preset={state?.preset} />
}

export function ComparePage() {
  return <Compare />
}
