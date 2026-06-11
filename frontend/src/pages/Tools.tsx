import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { PortfolioSection } from './Analysis'
import Backtest from './Backtest'
import Validation from './Validation'
import Compare from './Compare'

// 전략 도구 — 헤더 "서비스 더보기" 드롭다운의 독립 페이지 3종.
// (과거 /tools 단일 페이지 + ?tab= 내부 탭 구조를 독립 라우트로 분리 — 드롭다운 구분 = 실제 페이지 구분.
//  내부 탭바는 제거해 이중 구조를 없앴다. 본문 최상단 제목도 제거 — 헤더 드롭다운이 위치를 보여줌.)

export function PortfolioPage() {
  const navigate = useNavigate()
  // 최적 비중(★최대샤프/◆최소분산)을 '포트폴리오 보유' 백테스트로 전달 — navigate state로 넘긴다.
  const sendToBacktest = (payload: any) => navigate('/strategy/backtest/portfolio', { state: { preset: payload } })
  return <PortfolioSection onSend={sendToBacktest} />
}

// 전략/기법은 URL 경로로 결정 — key로 리마운트해 전략 전환 시 상태·자동실행이 초기화되게 한다.
export function BacktestPage() {
  const { state } = useLocation()
  const { strategy } = useParams()
  return <Backtest key={strategy} strategy={strategy} preset={state?.preset} />
}

export function ValidationPage() {
  // 검증 3기법을 한 페이지에 모아 표시(드롭다운 아님).
  return <Validation />
}

export function ComparePage() {
  return <Compare />
}
