import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import ErrorBoundary from '../ErrorBoundary'

// 헤더 드롭다운으로 들어간 페이지는 어떤 그룹·항목인지 헤더만으론 알기 어려워(드롭다운은 닫히면 안 보임),
// 본문 최상단에 '그룹 › 페이지' 브레드크럼을 표시한다. 단일 링크 페이지(시장 동향·최적화·검증·코인목록 등)는 제외.
const CRUMB: Record<string, [string, string]> = {
  '/market/overview': ['마켓', '시장 현황'],
  '/market/sectors': ['마켓', '섹터'],
  '/market/screener': ['마켓', '스크리너'],
  '/market/compare': ['마켓', '종목 비교'],
  '/research/structure': ['리서치', '시장 구조'],
  '/research/regime': ['리서치', '시장 국면'],
  '/research/factor': ['리서치', '팩터'],
  '/research/risk': ['리서치', '리스크'],
  '/strategy/backtest/ma': ['백테스트', 'MA 크로스'],
  '/strategy/backtest/rsi': ['백테스트', 'RSI 역추세'],
  '/strategy/backtest/tsmom': ['백테스트', '추세추종(TSMOM)'],
  '/strategy/backtest/portfolio': ['백테스트', '포트폴리오 보유'],
}
function crumbFor(pathname: string): [string, string] | null {
  if (CRUMB[pathname]) return CRUMB[pathname]
  if (pathname.startsWith('/strategy/backtest')) return ['백테스트', 'MA 크로스']  // 기본 진입(/strategy/backtest)
  return null
}

function Layout() {
  // key={pathname} — 라우트가 바뀌면 ErrorBoundary가 재마운트되며 에러 상태가 리셋된다
  // (한 페이지가 크래시해도 다른 메뉴로 이동하면 자동 복구).
  const { pathname } = useLocation()
  const crumb = crumbFor(pathname)
  return (
    <div className="min-h-screen bg-[#e6eaf2] dark:bg-[#0e1320] text-gray-900 flex flex-col">
      <Header />
      <main className="max-w-[1440px] mx-auto px-4 py-5 w-full flex-1">
        {crumb && (
          <div className="mb-4 text-sm">
            <span className="font-semibold text-gray-700 dark:text-gray-200">{crumb[0]}</span>
            <span className="mx-1.5 text-gray-300 dark:text-gray-600">›</span>
            <span className="text-gray-500 dark:text-gray-400">{crumb[1]}</span>
          </div>
        )}
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  )
}

export default Layout
