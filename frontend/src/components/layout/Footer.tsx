import { Link } from 'react-router-dom'
import { openCenteredWindow } from '../../utils/popup'

// 전 페이지 공통 푸터. 업비트 푸터의 느낌(좌측 브랜드/데이터 출처 + 링크 컬럼 + 하단 면책/저작권)을 본떴다.
// ⚠️ width는 헤더(full-bleed)와 달리 페이지 본문(max-w-[1440px])에 맞춘다 — 상단 구분선도 본문 폭만큼만.
// 가짜 사업자정보·연락처는 넣지 않고, 이 프로젝트의 실제 정보(데이터 출처·면책·기술 스택)만 담는다.

// 헤더 그룹과 1:1로 맞춘다 — 마켓·리서치·전략 드롭다운 항목 그대로. 시장 동향(단일)·코인 목록(로고)은
// 헤더의 단독 진입점이라 컬럼이 아니라 브랜드 영역 바로가기로 둔다.
const NAV_COLUMNS = [
  {
    title: '마켓',
    links: [
      { label: '시장 현황', to: '/market/overview' },
      { label: '섹터', to: '/market/sectors' },
      { label: '스크리너', to: '/market/screener' },
      { label: '종목 비교', to: '/market/compare' },
    ],
  },
  {
    title: '리서치',
    links: [
      { label: '시장 구조', to: '/research/structure' },
      { label: '시장 국면', to: '/research/regime' },
      { label: '팩터', to: '/research/factor' },
      { label: '리스크', to: '/research/risk' },
    ],
  },
  {
    title: '전략',
    links: [
      { label: '최적화', to: '/strategy/portfolio' },
      { label: '백테스트', to: '/strategy/backtest/ma' },
      { label: '검증', to: '/strategy/validation' },
    ],
  },
]

function openWin(path: string, name: string) {
  openCenteredWindow(path, name)
}

// 흰 배경은 헤더처럼 뷰포트 전체 width(full-bleed)로 깔고, 맨 아래까지 닿게(여백 없음).
// 내부 요소는 페이지 컴포넌트와 동일하게 max-w-[1440px] 중앙 정렬.
function Footer() {
  return (
    <footer className="bg-white dark:bg-[#1a2234] border-t border-gray-200 dark:border-[#2c3850] w-full mt-16">
      <div className="max-w-[1440px] mx-auto px-4 pt-10 pb-16">
        {/* 상단: 브랜드(2칸) + 네비 3컬럼 + 안내 = md 6칸 한 줄 (안내가 전략 도구 오른쪽 같은 레벨) */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
          {/* 브랜드 — 2칸. 로고는 흰색 PNG라 CSS mask로 브랜드 네이비(#093687)를 입혀 사용.
              로고/설명을 오른쪽으로 들여써(md:pl-8) 안내 컬럼의 우측 여백과 좌우 균형을 맞춤. */}
          <div className="col-span-2 md:pl-16">
            <div
              role="img"
              aria-label="UPquant"
              style={{
                width: 152, height: 58,
                backgroundColor: '#093687',
                WebkitMaskImage: 'url(/logo.png)', maskImage: 'url(/logo.png)',
                WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                WebkitMaskSize: 'contain', maskSize: 'contain',
                WebkitMaskPosition: 'left center', maskPosition: 'left center',
              }}
            />
            <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300 max-w-xs">
              업비트 KRW 마켓 시세 기반 암호화폐 분석 대시보드
              <br></br>
              섹터 분석 · 정량 분석 · 리스크 분석 · 백테스트
            </p>
            {/* 헤더의 단독 진입점(로고=코인 목록, 시장 동향)은 드롭다운 컬럼이 아니라 브랜드 영역 바로가기로 */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link to="/" className="text-gray-600 dark:text-gray-300 hover:text-brand-600 transition-colors">코인 목록</Link>
              <Link to="/trends" className="text-gray-600 dark:text-gray-300 hover:text-brand-600 transition-colors">시장 동향</Link>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              데이터 출처 · 업비트 Open API
            </p>
          </div>

          {/* 네비 컬럼 */}
          {NAV_COLUMNS.map(col => (
            <div key={col.title}>
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">{col.title}</div>
              <ul className="space-y-2.5">
                {col.links.map(l => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-sm text-gray-600 dark:text-gray-300 hover:text-brand-600 transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* 안내 — 도움말·가이드(새 창) + 외부. 전략 도구 오른쪽 같은 레벨 */}
          <div>
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">안내</div>
            <ul className="space-y-2.5">
              <li>
                <button type="button" onClick={() => openWin('/help', 'upquant-help')}
                  className="text-sm text-gray-600 dark:text-gray-300 hover:text-brand-600 transition-colors cursor-pointer">
                  도움말
                </button>
              </li>
              <li>
                <button type="button" onClick={() => openWin('/guide', 'upquant-guide')}
                  className="text-sm text-gray-600 dark:text-gray-300 hover:text-brand-600 transition-colors cursor-pointer">
                  분석 가이드
                </button>
              </li>
              <li>
                <Link to="/system" className="text-sm text-gray-600 dark:text-gray-300 hover:text-brand-600 transition-colors">
                  시스템 모니터링
                </Link>
              </li>
              <li>
                <a href="https://docs.upbit.com/reference" target="_blank" rel="noreferrer"
                  className="text-sm text-gray-600 dark:text-gray-300 hover:text-brand-600 transition-colors">
                  업비트 Open API ↗
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* 하단: 면책 + 저작권 + 기술 스택 */}
        <div className="mt-10 pt-6 border-t border-gray-100 dark:border-[#232d40] space-y-2">
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            본 서비스는 <b className="font-medium text-gray-700 dark:text-gray-200">정보 제공 목적</b>이며 투자 권유가 아닙니다.
            <br/>
            가상자산은 고위험 상품으로 투자 원금의 전부 또는 일부 손실이 발생할 수 있습니다.
            <br/>
            모든 수치는 과거 데이터 기반이며 미래 수익을 보장하지 않습니다.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">© 2026 UPquant · 비상업 개인 프로젝트</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
