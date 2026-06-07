import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWsConnected } from '../../contexts/useRealtime'
import { PriceAlertMenu } from '../../contexts/PriceAlerts'
import ReportModal from '../ReportModal'

// 다크모드 토글 — html.dark 클래스 + localStorage 영속. 해/달 아이콘.
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
      className="flex items-center px-2 text-white/60 hover:text-white/85 transition-colors cursor-pointer"
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

// 실시간 WS 연결 상태 — 녹색 점(실시간)/회색 점(연결 끊김)
function WsIndicator() {
  const connected = useWsConnected()
  return (
    <span className="flex items-center gap-1 px-2 text-[11px] text-white/55"
      title={connected ? '실시간 시세 연결됨' : '실시간 연결 끊김 (재연결 시도 중)'}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-400'}`} />
      {connected ? '실시간' : '오프라인'}
    </span>
  )
}

// 상단 메인 탭 — 드롭다운/중첩 없이 평탄하게 펼치되, 의도별로 그룹(구분선)으로 묶는다.
// ① 홈  ② 둘러보기(마켓·섹터·스크리너·코인목록)  ③ 시장 분석(관찰형)  ④ 전략(내가 돌리는 도구)
// 과거 탐색에 묻혀 있던 마켓·섹터·스크리너 서브탭을 헤더 탭으로 승격(서로 다른 목적이라 분리).
const tabGroups = [
  [
    { to: '/dashboard', label: '대시보드', match: (p) => p.startsWith('/dashboard') },
  ],
  [
    // 코인 목록은 로고(/)가 곧 진입점이라 별도 탭 없음.
    { to: '/market',   label: '마켓',     match: (p) => p.startsWith('/market') || p === '/explore' },
    { to: '/sectors',  label: '섹터',     match: (p) => p.startsWith('/sectors') },
    { to: '/screener', label: '스크리너', match: (p) => p.startsWith('/screener') },
  ],
  [
    { to: '/structure', label: '시장 구조', match: (p) => p.startsWith('/structure') },
    { to: '/regime',    label: '시장 국면', match: (p) => p.startsWith('/regime') },
    { to: '/factor',    label: '팩터 분석', match: (p) => p.startsWith('/factor') },
    { to: '/risk',      label: '리스크',    match: (p) => p.startsWith('/risk') },
  ],
]

// 전략 도구는 "서비스 더보기" 드롭다운(호버 시 목록) — 각 항목은 독립 페이지(/tools/<tab>).
const TOOL_ITEMS = [
  {
    tab: 'portfolio', label: '포트폴리오 최적화', desc: '위험 대비 최적 비중 (효율적 경계선)',
    icon: <path d="M21 12a9 9 0 1 1-9-9v9z" />,
  },
  {
    tab: 'backtest', label: '백테스트', desc: '과거 데이터로 전략 성과 검증',
    icon: <><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>,
  },
  {
    tab: 'compare', label: '비교 분석', desc: '여러 종목 수익률을 나란히 비교',
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
          서비스 더보기
          <span className="absolute -top-1 -right-3 w-1.5 h-1.5 rounded-full bg-red-500" />
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          className={`ml-2 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 w-80 rounded-lg border border-gray-100 dark:border-[#232d40] bg-white dark:bg-[#1a2234] p-2 shadow-xl">
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
                  <span className={`block text-sm font-semibold ${itemActive ? 'text-brand-600' : 'text-gray-800 dark:text-gray-100'}`}>{it.label}</span>
                  <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{it.desc}</span>
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
  const [reportOpen, setReportOpen] = useState(false)

  return (
    <>
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
          <WsIndicator />
          <ThemeToggle />
          <PriceAlertMenu />
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-1 px-3 text-[13px] text-white/70 hover:text-white transition-colors cursor-pointer"
            title="AI 투자 전략 리포트 (Gemini)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
            </svg>
            AI 리포트
          </button>
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
    {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}
    </>
  )
}

export default Header
