import { useLocation } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader'
import Market from './Market'
import Sectors from './Sectors'
import Screener from './Screener'

// 둘러보기 본문 라우터 — 마켓 현황·섹터·스크리너를 경로에 따라 렌더한다.
// 탭 전환은 헤더(상단 메인 탭)가 맡으므로 페이지 안에는 서브탭 바를 두지 않는다(중첩 제거).
// 경로가 단일 출처 — /market·/sectors·/screener 딥링크가 곧 화면.
const VIEWS = {
  market:   { label: '시장 현황', desc: '순위·거래대금·52주·트리맵', Comp: Market },
  sectors:  { label: '섹터',      desc: '카테고리 누적·월별·상관 + 드릴다운', Comp: Sectors },
  screener: { label: '스크리너',  desc: '조건으로 종목 필터링', Comp: Screener },
}

function viewFromPath(pathname) {
  if (pathname.startsWith('/sectors')) return 'sectors'
  if (pathname.startsWith('/screener')) return 'screener'
  return 'market'  // /explore·/market 기본
}

export default function Explore() {
  const { pathname } = useLocation()
  const view = VIEWS[viewFromPath(pathname)]
  const Active = view.Comp
  return (
    <div className="space-y-4">
      <PageHeader title={view.label} description={view.desc} />
      <Active />
    </div>
  )
}
