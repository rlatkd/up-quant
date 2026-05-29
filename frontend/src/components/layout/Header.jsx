import { Link, NavLink } from 'react-router-dom'

const tabs = [
  { to: '/',         label: '대시보드',  end: true },
  { to: '/market',   label: '마켓 현황', end: false },
  { to: '/coins',    label: '코인 목록', end: false },
  { to: '/compare',  label: '비교 분석', end: false },
  { to: '/backtest', label: '백테스트',  end: false },
  { to: '/screener', label: '스크리너',  end: false },
]

function openHelpWindow() {
  window.open(
    '/help',
    'upquant-help',
    'width=860,height=900,menubar=no,toolbar=no,location=no,status=no',
  )
}

function Header() {
  return (
    <header className="bg-[#093687] text-white sticky top-0 z-50">
      <div className="max-w-[1440px] mx-auto px-6 flex items-center h-[60px]">
        <Link to="/" className="flex items-center mr-10">
          <span className="text-[19px] font-extrabold italic tracking-tight text-white">UPquant</span>
        </Link>
        <nav className="flex h-full">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex items-center px-4 text-[14px] border-b-2 transition-colors ${
                  isActive
                    ? 'text-white border-white font-bold'
                    : 'text-white/70 border-transparent hover:text-white/90 font-semibold'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={openHelpWindow}
            className="flex items-center gap-1 px-3 text-[13px] text-white/60 hover:text-white/90 transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-current text-[10px] leading-none">?</span>
            도움말
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
