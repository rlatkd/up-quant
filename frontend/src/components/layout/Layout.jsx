import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import ErrorBoundary from '../ErrorBoundary'

function Layout() {
  // key={pathname} — 라우트가 바뀌면 ErrorBoundary가 재마운트되며 에러 상태가 리셋된다
  // (한 페이지가 크래시해도 다른 메뉴로 이동하면 자동 복구).
  const { pathname } = useLocation()
  return (
    <div className="min-h-screen bg-[#e6eaf2] text-gray-900 flex flex-col">
      <Header />
      <main className="max-w-[1440px] mx-auto px-4 py-5 w-full flex-1">
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  )
}

export default Layout
