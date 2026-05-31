import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAnalysisCart } from '../../contexts/useAnalysisCart'

// 상단 메인 탭: 대시보드 · 탐색(마켓·섹터·스크리너) · 코인 목록.
// 분석(관찰형)은 "분석" 드롭다운(시장 구조 / 팩터·전략 2페이지), 설정형은 "서비스 더보기" 드롭다운.
const mainTabs = [
  { to: '/',        label: '대시보드',  match: (p) => p === '/' },
  { to: '/explore', label: '탐색',      match: (p) => ['/explore', '/market', '/sectors', '/screener'].some(x => p.startsWith(x)) },
  { to: '/coins',   label: '코인 목록', match: (p) => p.startsWith('/coins') },
]

// "분석" 드롭다운 = 관찰형(시장 전체 자동 분석). 두 페이지로 분리.
const analysisItems = [
  {
    to: '/analysis/structure', label: '시장 구조', desc: '상관 네트워크·PCA 요인·클러스터링·시장 국면',
    icon: <g><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M7.7 8.4 11 16M16.4 7.7 13 16M8 6.6h8" /></g>,
  },
  {
    to: '/analysis/factor', label: '팩터·전략', desc: '모멘텀 팩터·페어트레이딩',
    icon: <path d="M4 18l5-5 4 3 7-8M14 8h6v6" />,
  },
]

// "서비스 더보기" 드롭다운 = 설정형(내가 종목/전략을 골라 돌리는) 정량 분석. 빨간 점 + 호버 패널.
const toolItems = [
  {
    to: '/tools?tab=portfolio', label: '포트폴리오 최적화', desc: 'Markowitz 효율적 경계선 — 종목 비중 최적화',
    icon: <g><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 9 9h-9z" /></g>,
  },
  {
    to: '/tools?tab=backtest', label: '백테스트', desc: '전략·포트폴리오 과거 성과 시뮬레이션',
    icon: <g><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M12 2.5h0" /></g>,
  },
  {
    to: '/tools?tab=compare', label: '비교 분석', desc: '여러 종목 수익률을 겹쳐 비교',
    icon: <path d="M5 20V9M12 20V4M19 20v-8" />,
  },
  {
    to: '/tools?tab=garch', label: '변동성 (GARCH)', desc: '종목 변동성 예측 · VaR',
    icon: <path d="M3 17l5-6 4 3 5-7M3 21h18" />,
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
                  onClick={() => go('/tools?tab=compare')}
                  className="px-2 py-1.5 text-xs font-medium bg-brand-500 text-white rounded hover:bg-brand-600 cursor-pointer transition-colors"
                  title={cart.count > 5 ? '상위 5종만 자동 선택됩니다' : ''}
                >
                  비교 분석 →
                </button>
                <button
                  type="button"
                  onClick={() => go('/tools?tab=backtest')}
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

// 헤더 호버 드롭다운 (아이콘+설명 패널). 분석·서비스 더보기 둘 다 이걸로.
function NavDropdown({ label, redDot = false, active, items, go }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="relative flex items-stretch"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`flex items-center ${redDot ? 'gap-4' : 'gap-1.5'} px-4 text-[14px] border-b-2 border-transparent transition-colors cursor-pointer ${
          active ? 'text-white font-bold' : 'text-white/70 hover:text-white/80 font-semibold'
        }`}
      >
        <span className="relative">
          {label}
          {redDot && <span className="absolute -top-0.5 -right-2.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 w-[320px] rounded-lg border border-gray-100 bg-white p-2 shadow-lg">
          {items.map(m => (
            <button
              key={m.to}
              type="button"
              onClick={() => { setOpen(false); go(m.to) }}
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
  )
}

function Header() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const anlActive = ['/analysis', '/quant'].some(x => pathname.startsWith(x))
  const toolsActive = ['/tools', '/compare', '/backtest'].some(x => pathname.startsWith(x))

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

          {/* 분석(관찰형) — 시장 구조 / 팩터·전략 두 페이지 드롭다운 */}
          <NavDropdown label="분석" active={anlActive} items={analysisItems} go={navigate} />
          {/* 서비스 더보기(설정형) — 종목/전략 선택 도구 (빨간 점) */}
          <NavDropdown label="서비스 더보기" redDot active={toolsActive} items={toolItems} go={navigate} />
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
