import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAnalysisCart } from '../../contexts/useAnalysisCart'

// 상단 메인 탭 = "시장을 본다". 탐색=마켓현황·섹터·스크리너 통합(P2-1).
// match: 현재 경로가 이 탭에 속하는지 — 탐색은 /explore 외 기존 딥링크(/market·/sectors·/screener)도 포함.
const mainTabs = [
  { to: '/',        label: '대시보드',  match: (p) => p === '/' },
  { to: '/explore', label: '탐색',      match: (p) => ['/explore', '/market', '/sectors', '/screener'].some(x => p.startsWith(x)) },
  { to: '/coins',   label: '코인 목록', match: (p) => p.startsWith('/coins') },
]

// "서비스 더보기" 드롭다운 = "내가 분석한다" 도구 (아이콘 + 설명). 스크리너는 탐색으로 이동.
const moreItems = [
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

// 헤더의 분석 카트 인디케이터 — 담긴 종목 N + 클릭 시 드롭다운(목록 + 비교/백테스트 진입)
function CartIndicator() {
  const cart = useAnalysisCart()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const ref = useRef(null)

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const go = (to) => { setOpen(false); navigate(to) }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 text-[13px] text-white/70 hover:text-white transition-colors cursor-pointer"
        title="분석 카트 — 담은 종목을 Compare/Backtest로 함께 보내기"
      >
        {/* 카트 아이콘 */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h2l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-9H5" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="17" cy="20" r="1" />
        </svg>
        분석 카트
        {cart.count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-bold bg-red-500 text-white rounded-full">
            {cart.count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 w-[280px] rounded-lg border border-gray-100 bg-white text-gray-800 shadow-lg">
          <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">담긴 종목 <span className="text-brand-500">{cart.count}</span></div>
            {cart.count > 0 && (
              <button type="button" onClick={cart.clear} className="text-xs text-gray-400 hover:text-red-500 cursor-pointer">비우기</button>
            )}
          </div>

          {cart.count === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-gray-400">
              종목 옆 + 버튼으로 담아보세요<br />
              <span className="text-gray-300">코인목록 · 마켓 · 스크리너 등</span>
            </div>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto py-1">
                {cart.items.map(m => (
                  <div key={m} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 text-sm">
                    <span className="text-gray-700 font-medium">{m.replace('KRW-', '')}</span>
                    <button type="button" onClick={() => cart.remove(m)} className="text-gray-300 hover:text-red-500 text-lg leading-none cursor-pointer">×</button>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 p-2 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => go('/compare')}
                  className="px-2 py-1.5 text-xs font-medium bg-brand-500 text-white rounded hover:bg-brand-600 cursor-pointer transition-colors"
                  title={cart.count > 5 ? '상위 5종만 자동 선택됩니다' : ''}
                >
                  비교 분석 →
                </button>
                <button
                  type="button"
                  onClick={() => go('/backtest')}
                  className="px-2 py-1.5 text-xs font-medium bg-brand-500 text-white rounded hover:bg-brand-600 cursor-pointer transition-colors"
                >
                  백테스트 →
                </button>
              </div>
              {cart.count > 5 && (
                <div className="px-3 pb-2 text-[10px] text-gray-400 text-center">※ 비교는 최대 5종 (담은 순서 상위 5)</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
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
          {mainTabs.map((t) => {
            const isActive = t.match(pathname)
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex items-center px-4 text-[14px] border-b-2 border-transparent transition-colors ${
                  isActive ? 'text-white font-bold' : 'text-white/70 hover:text-white/80 font-semibold'
                }`}
              >
                {t.label}
              </Link>
            )
          })}

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

          {/* 퀀트 랩 — 별도 강조 탭 (정량 분석 플래그십) */}
          <NavLink
            to="/quant"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-4 text-[14px] border-b-2 border-transparent transition-colors ${
                isActive ? 'text-white font-bold' : 'text-amber-200/90 hover:text-white font-semibold'
              }`
            }
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3v16a2 2 0 0 0 2 2h14" /><path d="M18 8l-5 5-3-3-4 4" />
            </svg>
            퀀트 랩
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <CartIndicator />
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
