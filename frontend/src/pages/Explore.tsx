import { useLocation } from 'react-router-dom'
import Market from './Market'
import Sectors from './Sectors'
import Screener from './Screener'

// 둘러보기 본문 라우터 — 마켓·섹터·스크리너를 경로에 따라 렌더한다.
// 탭 전환은 헤더(상단 메인 탭)가 맡고, 현재 위치도 헤더 탭 활성으로 드러나므로
// 페이지 안에는 서브탭 바도, 중복 제목(PageHeader)도 두지 않는다. 경로가 단일 출처.
const VIEWS = { market: Market, sectors: Sectors, screener: Screener }

function viewFromPath(pathname: string) {
  if (pathname.startsWith('/market/sectors')) return 'sectors'
  if (pathname.startsWith('/market/screener')) return 'screener'
  return 'market'  // /market/overview 기본
}

export default function Explore() {
  const { pathname } = useLocation()
  const Active = VIEWS[viewFromPath(pathname)]
  return <Active />
}
