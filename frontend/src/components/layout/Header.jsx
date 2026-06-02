import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAnalysisCart } from '../../contexts/useAnalysisCart'

// 상단 메인 탭 — 드롭다운/중첩 없이 평탄하게 펼치되, 의도별로 그룹(구분선)으로 묶는다.
// ① 홈  ② 둘러보기(마켓·섹터·스크리너·코인목록)  ③ 시장 분석(관찰형)  ④ 전략(내가 돌리는 도구)
// 과거 탐색에 묻혀 있던 마켓·섹터·스크리너 서브탭을 헤더 탭으로 승격(서로 다른 목적이라 분리).
const tabGroups = [
  [
    { to: '/dashboard', label: 'Dashboard', match: (p) => p.startsWith('/dashboard') },
  ],
  [
    // 코인 목록은 로고(/)가 곧 진입점이라 별도 탭 없음.
    { to: '/market',   label: 'Markets',  match: (p) => p.startsWith('/market') || p === '/explore' },
    { to: '/sectors',  label: 'Sectors',  match: (p) => p.startsWith('/sectors') },
    { to: '/screener', label: 'Screener', match: (p) => p.startsWith('/screener') },
  ],
  [
    { to: '/structure', label: 'Market Structure', match: (p) => p.startsWith('/structure') },
    { to: '/factor',    label: 'Factor Analysis',  match: (p) => p.startsWith('/factor') },
    { to: '/risk',      label: 'Risk',             match: (p) => p.startsWith('/risk') },
  ],
]

// 전략 도구는 "서비스 더보기" 드롭다운(호버 시 목록) — 각 항목은 독립 페이지(/tools/<tab>).
const TOOL_ITEMS = [
  {
    tab: 'portfolio', label: 'Portfolio Optimization', desc: '위험 대비 최적 비중 (효율적 경계선)',
    icon: <path d="M21 12a9 9 0 1 1-9-9v9z" />,
  },
  {
    tab: 'backtest', label: 'Backtest', desc: '과거 데이터로 전략 성과 검증',
    icon: <><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>,
  },
  {
    tab: 'compare', label: 'Compare', desc: '여러 종목 수익률을 나란히 비교',
    icon: <><rect x="4" y="10" width="4" height="10" /><rect x="10" y="5" width="4" height="15" /><rect x="16" y="13" width="4" height="7" /></>,
  },
]

function openHelpWindow() {
  window.open(
    '/help',
    'upquant-help',
    'width=860,height=900,menubar=no,toolbar=no,location=no,status=no',
  )
}

function openGuideWindow() {
  window.open(
    '/guide',
    'upquant-guide',
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
                  onClick={() => go('/tools/compare')}
                  className="px-2 py-1.5 text-xs font-medium bg-brand-500 text-white rounded hover:bg-brand-600 cursor-pointer transition-colors"
                  title={cart.count > 5 ? '상위 5종만 자동 선택됩니다' : ''}
                >
                  비교 분석 →
                </button>
                <button
                  type="button"
                  onClick={() => go('/tools/backtest')}
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

// "서비스 더보기" 드롭다운 — 호버 시 펼침. 하위 도구 진입 시 라벨 활성(불) + 상시 빨간점.
function ServiceMoreMenu() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const active = pathname.startsWith('/tools')
  const curTab = pathname.split('/')[2] || 'portfolio'   // /tools/backtest → 'backtest'

  return (
    <div
      className="relative flex h-full items-stretch"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`flex items-center gap-1 px-3.5 text-[14px] border-b-2 border-transparent transition-colors cursor-pointer ${
          active ? 'text-white font-bold' : 'text-white/70 hover:text-white/80 font-semibold'
        }`}
      >
        <span className="relative">
          More
          <span className="absolute -top-1 -right-3 w-1.5 h-1.5 rounded-full bg-red-500" />
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          className={`ml-2 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 w-80 rounded-lg border border-gray-100 bg-white p-2 shadow-xl">
          {TOOL_ITEMS.map(it => {
            const itemActive = active && curTab === it.tab
            return (
              <Link
                key={it.tab}
                to={`/tools/${it.tab}`}
                onClick={() => setOpen(false)}
                className={`flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors ${
                  itemActive ? 'bg-brand-50' : 'hover:bg-gray-50'
                }`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke={itemActive ? '#1763b6' : '#64748b'} strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                  {it.icon}
                </svg>
                <span>
                  <span className={`block text-sm font-semibold ${itemActive ? 'text-brand-600' : 'text-gray-800'}`}>{it.label}</span>
                  <span className="block text-xs text-gray-400 mt-0.5">{it.desc}</span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Header() {
  const { pathname } = useLocation()

  return (
    <header className="bg-[#093687] text-white sticky top-0 z-50">
      <div className="max-w-[1440px] mx-auto px-6 flex items-center h-[60px]">
        <Link to="/" className="flex items-center mr-8">
          <img src="/logo.png" alt="UPquant" className="h-13 w-auto" />
        </Link>
        <nav className="flex h-full items-stretch">
          {tabGroups.map((group, gi) => (
            <div key={gi} className="flex h-full items-stretch">
              {gi > 0 && <span className="self-center w-px h-5 bg-white/20 mx-1.5" />}
              {group.map((t) => {
                const isActive = t.match(pathname)
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    className={`flex items-center px-3.5 text-[14px] border-b-2 border-transparent transition-colors ${
                      isActive ? 'text-white font-bold' : 'text-white/70 hover:text-white/80 font-semibold'
                    }`}
                  >
                    {t.label}
                  </Link>
                )
              })}
            </div>
          ))}
          <span className="self-center w-px h-5 bg-white/20 mx-1.5" />
          <ServiceMoreMenu />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <CartIndicator />
          <button
            type="button"
            onClick={openGuideWindow}
            className="flex items-center gap-1 px-3 text-[13px] text-white/60 hover:text-white/80 transition-colors cursor-pointer"
            title="분석 방법론·기술 스택 가이드 (새 창)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" /><path d="M4 19h14" />
            </svg>
            가이드
          </button>
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
