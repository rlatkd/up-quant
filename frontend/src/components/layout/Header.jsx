import { useState } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'

// 상단 메인 탭 = "시장을 본다"
const mainTabs = [
  { to: '/',        label: '대시보드',  end: true },
  { to: '/market',  label: '마켓 현황', end: false },
  { to: '/sectors', label: '섹터 분석', end: false },
  { to: '/coins',   label: '코인 목록', end: false },
]

// "서비스 더보기" 드롭다운 = "내가 분석한다" 도구 (아이콘 + 설명)
const moreItems = [
  {
    to: '/screener', label: '스크리너', desc: '조건에 맞는 종목만 필터링',
    icon: <path d="M3 5h18M6 12h12M10 19h4" />,
  },
  {
    to: '/compare', label: '비교 분석', desc: '여러 종목 수익률을 겹쳐 비교',
    icon: <path d="M5 20V9M12 20V4M19 20v-8" />,
  },
  {
    to: '/backtest', label: '백테스트', desc: '매매 전략의 과거 성과 시뮬레이션',
    icon: <g><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M12 2.5h0" /></g>,
  },
]

function Icon({ children }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

function openHelpWindow() {
  window.open(
    '/help',
    'upquant-help',
    'width=860,height=900,menubar=no,toolbar=no,location=no,status=no',
  )
}

function Header() {
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const moreActive = moreItems.some(m => pathname.startsWith(m.to))

  function go(to) {
    setMoreOpen(false)
    navigate(to)
  }

  return (
    <header className="bg-[#093687] text-white sticky top-0 z-50">
      <div className="max-w-[1440px] mx-auto px-6 flex items-center h-[60px]">
        <Link to="/" className="flex items-center mr-8">
          <img src="/logo.png" alt="UPquant" className="h-13 w-auto" />
        </Link>
        <nav className="flex h-full items-stretch">
          {mainTabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex items-center px-4 text-[14px] border-b-2 transition-colors ${
                  isActive
                    ? 'text-white border-transparent font-bold'
                    : 'text-white/70 border-transparent hover:text-white/80 font-semibold'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}

          {/* 서비스 더보기 — 드롭다운 (스크리너·비교분석·백테스트) */}
          <div
            className="relative flex items-stretch"
            onMouseEnter={() => setMoreOpen(true)}
            onMouseLeave={() => setMoreOpen(false)}
          >
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 text-[14px] border-b-2 border-transparent transition-colors cursor-pointer ${
                moreActive
                  ? 'text-white font-bold'
                  : 'text-white/70 hover:text-white/80 font-semibold'
              }`}
            >
              <span className="relative">
                서비스 더보기
                <span className="absolute -top-0.5 -right-2 w-1.5 h-1.5 rounded-full bg-red-500" />
              </span>
              <svg width="10" height="6" viewBox="0 0 10 6" className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`}>
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {moreOpen && (
              <div className="absolute top-full left-0 z-50 w-[320px] rounded-lg border border-gray-100 bg-white p-2 shadow-lg">
                {moreItems.map(m => (
                  <button
                    key={m.to}
                    type="button"
                    onClick={() => go(m.to)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-gray-50 cursor-pointer"
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                      <Icon>{m.icon}</Icon>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-800">{m.label}</span>
                      <span className="block text-xs text-gray-400">{m.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>
        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={openHelpWindow}
            className="flex items-center gap-1 px-3 text-[13px] text-white/60 hover:text-white/80 transition-colors cursor-pointer"
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
