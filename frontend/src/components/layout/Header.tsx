import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWsConnected } from '../../contexts/useRealtime'
import { PriceAlertMenu } from '../../contexts/PriceAlerts'
import ReportModal from '../ReportModal'

// 다크모드 토글 — html.dark 클래스 + localStorage 영속.
function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('upquant_theme', next ? 'dark' : 'light') } catch { /* ignore */ }
  }
  return (
    <button type="button" onClick={toggle}
      className="flex items-center px-2 text-white/60 hover:text-white/90 transition-colors cursor-pointer"
      title={dark ? '라이트 모드로' : '다크 모드로'}>
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}

// ── 메인 내비 — 4그룹(대시보드 단일 + 둘러보기·분석·전략 드롭다운) ──
// 평탄 탭이 과해 그룹 드롭다운으로 축소. 하위 항목은 호버 시 펼침(내비 한정 — 페이지 콘텐츠는 탭으로 숨기지 않음).
const NAV: { label: string; to?: string; match: (p: string) => boolean; items?: { to: string; label: string }[] }[] = [
  { label: '대시보드', to: '/dashboard', match: (p) => p.startsWith('/dashboard') },
  {
    label: '둘러보기', match: (p) => /^\/(market|sectors|screener|explore)/.test(p),
    items: [
      { to: '/market', label: '마켓 현황' },
      { to: '/sectors', label: '섹터' },
      { to: '/screener', label: '스크리너' },
    ],
  },
  {
    label: '분석', match: (p) => /^\/(structure|regime|factor|risk)/.test(p),
    items: [
      { to: '/structure', label: '시장 구조' },
      { to: '/regime', label: '시장 국면' },
      { to: '/factor', label: '팩터 분석' },
      { to: '/risk', label: '리스크' },
    ],
  },
  {
    label: '전략', match: (p) => p.startsWith('/tools'),
    items: [
      { to: '/tools/portfolio', label: '포트폴리오 최적화' },
      { to: '/tools/backtest', label: '백테스트' },
      { to: '/tools/compare', label: '비교 분석' },
    ],
  },
]

function NavGroup({ group }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const active = group.match(pathname)
  const cls = `flex items-center gap-1 px-3.5 h-full text-[14px] border-b-2 transition-colors cursor-pointer ${
    active ? 'text-white font-bold border-white/80' : 'text-white/70 hover:text-white/90 font-semibold border-transparent'
  }`

  // 단일 링크(대시보드)
  if (!group.items) {
    return <Link to={group.to} className={cls}>{group.label}</Link>
  }
  // 드롭다운 그룹
  return (
    <div className="relative flex h-full items-stretch"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className={cls}>
        {group.label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          className={`ml-0.5 transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-0 w-48 rounded-b-lg border border-gray-100 dark:border-[#232d40] bg-white dark:bg-[#1a2234] py-1.5 shadow-xl">
          {group.items.map(it => {
            const itemActive = pathname.startsWith(it.to)
            return (
              <Link key={it.to} to={it.to} onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm transition-colors ${
                  itemActive ? 'text-brand-600 font-semibold bg-brand-50' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50'
                }`}>
                {it.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function openWin(path: string, name: string) {
  window.open(path, name, 'width=860,height=900,menubar=no,toolbar=no,location=no,status=no')
}

// ── 오른쪽 "더보기(⋯)" — 가이드·도움말·시스템·실시간 상태를 한 메뉴로 묶음 ──
function MoreMenu() {
  const [open, setOpen] = useState(false)
  const connected = useWsConnected()
  return (
    <div className="relative flex items-center"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" title="더보기"
        className="flex items-center px-2 text-white/60 hover:text-white/90 transition-colors cursor-pointer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-52 rounded-lg border border-gray-100 dark:border-[#232d40] bg-white dark:bg-[#1a2234] py-1.5 shadow-xl text-gray-700 dark:text-gray-200">
          <button type="button" onClick={() => { setOpen(false); openWin('/guide', 'upquant-guide') }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer">분석 가이드</button>
          <button type="button" onClick={() => { setOpen(false); openWin('/help', 'upquant-help') }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer">도움말</button>
          <Link to="/system" onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm hover:bg-gray-50">시스템 모니터링</Link>
          <div className="my-1 border-t border-gray-100 dark:border-[#232d40]" />
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-400'}`} />
            {connected ? '실시간 연결됨' : '실시간 끊김 (재연결 중)'}
          </div>
        </div>
      )}
    </div>
  )
}

function Header() {
  const [reportOpen, setReportOpen] = useState(false)
  return (
    <>
    <header className="bg-[#093687] text-white sticky top-0 z-50">
      <div className="max-w-[1440px] mx-auto px-6 flex items-center h-[60px]">
        <Link to="/" className="flex items-center mr-8" title="코인 목록">
          <img src="/logo.png" alt="UPquant" className="h-13 w-auto" />
        </Link>
        <nav className="flex h-full items-stretch">
          {NAV.map(g => <NavGroup key={g.label} group={g} />)}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <PriceAlertMenu />
          <ThemeToggle />
          <button type="button" onClick={() => setReportOpen(true)} title="AI 투자 전략 리포트 (Gemini)"
            className="flex items-center px-2 text-white/65 hover:text-white transition-colors cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
            </svg>
          </button>
          <MoreMenu />
        </div>
      </div>
    </header>
    {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}
    </>
  )
}

export default Header
