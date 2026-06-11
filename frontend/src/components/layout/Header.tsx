import { useState, Fragment } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWsConnected } from '../../contexts/useRealtime'
import { PriceAlertMenu } from '../../contexts/PriceAlerts'
import { useAuth } from '../../contexts/useAuth'
import ReportModal from '../ReportModal'
import { openCenteredWindow } from '../../utils/popup'

// 호버 드롭다운 공용 동작 — 좌측 그룹(NavGroup)·우측 더보기(MoreMenu)가 같은 동작을 쓰도록 한곳에서 관리.
// (닫힘 판정은 즉시. 트리거↔메뉴 사이 빈 모서리에서 끊기는 건 메뉴의 투명 브릿지(before)로 호버 영역을 넓혀 해결.)
function useHoverMenu() {
  const [open, setOpen] = useState(false)
  return { open, enter: () => setOpen(true), leave: () => setOpen(false), close: () => setOpen(false) }
}

// 메뉴 위(트리거와의 사이)에 투명 브릿지를 깔아 대각선 이동 시에도 호버가 끊기지 않게 한다.
// bottom-full=메뉴 바로 위, 좌우로 8px씩 더 넓혀(-inset-x-2) 버튼보다 넓은 메뉴의 모서리 사각지대를 덮는다.
const HOVER_BRIDGE = "before:content-[''] before:absolute before:bottom-full before:-inset-x-2 before:h-3"

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

// ── 메인 내비 — 자산운용 리서치 톤 4그룹(시황 단일 + 마켓·리서치·포트폴리오 드롭다운) ──
// 평탄 탭이 과해 그룹 드롭다운으로 축소. 하위 항목은 호버 시 펼침(내비 한정 — 페이지 콘텐츠는 탭으로 숨기지 않음).
// URL은 '/그룹/페이지' 규약 — 드롭다운 그룹명(market·research·strategy)이 곧 경로 prefix.
// 스크리너(전체 시장 조건 발굴)·종목 비교(발굴한 후보를 겹쳐 비교)는 '탐색' 성격이라 마켓 그룹에 둔다.
// 리서치는 전 종목 대상 무거운 정량/ML 분석(구조·국면·팩터·리스크)만 남긴다.
// divider:true = 그 항목 앞에 세로 구분선. 분석(시장동향·마켓·리서치) │ 실행(최적화·백테스트·검증)의
// 단일 경계만 둔다 — '시장을 이해·분석하는 단계' vs '전략을 세워 실행하는 단계'.
const NAV: { label: string; to?: string; match: (p: string) => boolean; items?: { to: string; label: string }[]; divider?: boolean }[] = [
  { label: '시장 동향', to: '/trends', match: (p) => p.startsWith('/trends') },
  {
    label: '마켓', match: (p) => p.startsWith('/market'),
    items: [
      { to: '/market/overview', label: '시장 현황' },
      { to: '/market/sectors', label: '섹터' },
      { to: '/market/screener', label: '스크리너' },
      { to: '/market/compare', label: '종목 비교' },
    ],
  },
  {
    label: '리서치', match: (p) => p.startsWith('/research'),
    items: [
      { to: '/research/structure', label: '시장 구조' },
      { to: '/research/regime', label: '시장 국면' },
      { to: '/research/factor', label: '팩터' },
      { to: '/research/risk', label: '리스크' },
    ],
  },
  // 최적화·검증은 단일 링크(검증은 3기법을 한 페이지에 모음). 백테스트(4전략)만 드롭다운 — 페이지 내부 탭 대신.
  { label: '최적화', to: '/strategy/portfolio', divider: true, match: (p) => p.startsWith('/strategy/portfolio') },
  {
    label: '백테스트', match: (p) => p.startsWith('/strategy/backtest'),
    items: [
      { to: '/strategy/backtest/ma', label: 'MA 크로스' },
      { to: '/strategy/backtest/rsi', label: 'RSI 역추세' },
      { to: '/strategy/backtest/tsmom', label: '추세추종(TSMOM)' },
      { to: '/strategy/backtest/portfolio', label: '포트폴리오 보유' },
    ],
  },
  { label: '검증', to: '/strategy/validation', match: (p) => p.startsWith('/strategy/validation') },
]

function NavGroup({ group }: { group: { label: string; to?: string; match: (p: string) => boolean; items?: { to: string; label: string }[] } }) {
  const { pathname } = useLocation()
  const { open, enter, leave, close } = useHoverMenu()
  const active = group.match(pathname)
  // 각 메뉴 영역을 같은 폭으로 — 글자 길이에 따라 폭이 달라 보이던 것을 min-w + 중앙정렬로 통일.
  const cls = `flex items-center justify-center gap-1 min-w-[96px] px-4 h-full text-[15.5px] transition-colors cursor-pointer ${
    active ? 'text-white font-bold' : 'text-white/70 hover:text-white/90 font-semibold'
  }`

  // 단일 링크(대시보드)
  if (!group.items) {
    return <Link to={group.to!} className={cls}>{group.label}</Link>
  }
  // 드롭다운 그룹
  return (
    <div className="relative flex h-full items-stretch"
      onMouseEnter={enter} onMouseLeave={leave}>
      {/* 라벨만 가운데 정렬(min-w 기준), 화살표는 라벨 오른쪽에 absolute로 붙여 정렬에 영향 안 주게 */}
      <button type="button" className={cls}>
        <span className="relative">
          {group.label}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
            className={`absolute left-full top-1/2 -translate-y-1/2 ml-1 transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>
      {open && (
        <div className={`absolute top-full left-0 z-50 mt-0 w-52 rounded-b-lg border border-gray-100 dark:border-[#232d40] bg-white dark:bg-[#1a2234] py-1.5 shadow-xl ${HOVER_BRIDGE}`}>
          {group.items.map((it) => {
            const itemActive = pathname.startsWith(it.to)
            return (
              <Link key={it.to} to={it.to} onClick={close}
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

// ── 오른쪽 "더보기(⋯)" — 가이드·도움말·시스템·실시간 상태를 한 메뉴로 묶음 ──
function MoreMenu() {
  const { open, enter, leave, close } = useHoverMenu()
  const connected = useWsConnected()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    // h-full(60px) + items-center — NavGroup과 동일하게 컨테이너가 헤더 높이를 꽉 채워야
    // top-full 드롭다운이 헤더 '아래'에서 시작한다(중앙정렬 컨테이너면 헤더를 침범).
    <div className="relative flex h-full items-center"
      onMouseEnter={enter} onMouseLeave={leave}>
      <button type="button" title="더보기"
        className="flex items-center gap-1 px-2 text-[15px] font-semibold text-white/70 hover:text-white/90 transition-colors cursor-pointer">
        더보기
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className={`absolute top-full right-0 z-50 mt-0 w-52 rounded-b-lg border border-gray-100 dark:border-[#232d40] bg-white dark:bg-[#1a2234] py-1.5 shadow-xl text-gray-700 dark:text-gray-200 ${HOVER_BRIDGE}`}>
          <button type="button" onClick={() => { close(); openCenteredWindow('/help', 'upquant-help') }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer">도움말</button>
          <button type="button" onClick={() => { close(); openCenteredWindow('/guide', 'upquant-guide') }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer">분석 가이드</button>
          <Link to="/system" onClick={close}
            className="block px-4 py-2 text-sm hover:bg-gray-50">시스템 모니터링</Link>
          <div className="my-1 border-t border-gray-100 dark:border-[#232d40]" />
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-400'}`} />
            {connected ? '실시간 연결됨' : '실시간 끊김 (재연결 중)'}
          </div>
          <div className="my-1 border-t border-gray-100 dark:border-[#232d40]" />
          <div className="px-4 py-1.5 text-[11px] text-gray-400 dark:text-gray-500">로그인: {user?.username || '—'}</div>
          <button type="button"
            onClick={async () => { close(); await logout(); navigate('/login') }}
            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-50 cursor-pointer">로그아웃</button>
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
        <nav className="flex h-full items-stretch gap-1">
          {NAV.map(g => (
            <Fragment key={g.label}>
              {g.divider && <span className="self-center mx-1 h-5 w-px bg-white/20" aria-hidden="true" />}
              <NavGroup group={g} />
            </Fragment>
          ))}
          {/* AI 분석 — 검증 다음, 구분선 우측(모달 트리거) */}
          <span className="self-center mx-1 h-5 w-px bg-white/20" aria-hidden="true" />
          <button type="button" onClick={() => setReportOpen(true)} title="AI 투자 전략 리포트 (Gemini)"
            className="flex items-center gap-1 px-3 h-full text-[15px] font-semibold text-white/70 hover:text-white transition-colors cursor-pointer">
            AI 전략
            <span className="px-1 py-0.5 rounded bg-white/15 text-[10px] font-bold italic leading-none">βeta</span>
          </button>
        </nav>
        <div className="ml-auto flex h-full items-center gap-1.5">
          <PriceAlertMenu />
          <ThemeToggle />
          <MoreMenu />
        </div>
      </div>
    </header>
    {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}
    </>
  )
}

export default Header
