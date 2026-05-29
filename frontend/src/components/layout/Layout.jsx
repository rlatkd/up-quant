import { Outlet } from 'react-router-dom'
import Header from './Header'

function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Header />
      <main className="max-w-[1440px] mx-auto px-4 py-5">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
