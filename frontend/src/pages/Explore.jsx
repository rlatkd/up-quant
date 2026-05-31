import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader'
import Market from './Market'
import Sectors from './Sectors'
import Screener from './Screener'

// 탐색(Explore) = "시장을 훑어 종목을 찾는다" 통합 페이지.
// 기존 마켓현황·섹터분석·스크리너를 한 페이지의 서브탭으로 합쳐 동선을 단순화(P2-1).
// 각 탭은 기존 페이지 본문을 그대로 재사용(자체 로딩) + 탭 진입 시 lazy 마운트.
// 탭 상태는 URL(경로)이 단일 출처 — /market·/sectors·/screener 딥링크가 곧 탭이고, 공유 가능.
const TABS = [
  { id: 'market', path: '/market', label: '시장 현황', desc: '순위·거래대금·52주·트리맵·리스크-수익 분포', Comp: Market },
  { id: 'sectors', path: '/sectors', label: '섹터', desc: '카테고리 누적·월별·상관 + 드릴다운', Comp: Sectors },
  { id: 'screener', path: '/screener', label: '스크리너', desc: '조건으로 종목 필터링', Comp: Screener },
]

function tabFromPath(pathname) {
  if (pathname.startsWith('/sectors')) return 'sectors'
  if (pathname.startsWith('/screener')) return 'screener'
  return 'market'  // /explore·/market 기본
}

export default function Explore() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const tabId = tabFromPath(pathname)
  const active = TABS.find(t => t.id === tabId) ?? TABS[0]
  const Active = active.Comp
  return (
    <div className="space-y-4">
      <PageHeader title="탐색" description={active.desc} />
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-px">
        {TABS.map(t => (
          <button key={t.id} onClick={() => navigate(t.path)}
            className={`px-3 py-1.5 text-sm rounded-t font-medium cursor-pointer transition-colors ${
              tabId === t.id ? 'bg-white border border-gray-200 border-b-white text-brand-600 -mb-px' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      <Active />
    </div>
  )
}
