import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

function Layout() {
  return (
    <div className="min-h-screen bg-[#e6eaf2] text-gray-900 flex flex-col">
      <Header />
      <main className="max-w-[1440px] mx-auto px-4 py-5 w-full flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

export default Layout
