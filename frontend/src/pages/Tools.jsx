import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader'
import { PortfolioSection } from './Analysis'
import Backtest from './Backtest'
import Compare from './Compare'

// 전략 도구(Tools) = "내가 종목/전략을 골라 돌리는" 설정형 분석. 헤더 "전략 도구" 탭으로 진입.
// 관찰형(시장 전체 자동 분석)은 Analysis.jsx(시장 구조/팩터 분석 탭)에 분리.
// (GARCH 변동성은 '한 종목 리스크'라 코인 상세로 일원화 — 여기선 제외.)
const TAB_META = [
  { id: 'portfolio', label: '포트폴리오 최적화' },
  { id: 'backtest', label: '백테스트' },
  { id: 'compare', label: '비교' },
]

export default function Tools() {
  const [sp, setSp] = useSearchParams()
  const tabId = TAB_META.some(t => t.id === sp.get('tab')) ? sp.get('tab') : 'portfolio'

  // 동선 통합(task#1): 포트폴리오 최적화에서 구한 비중(★최대샤프/◆최소분산)을 백테스트로 넘긴다.
  // 탭 전환 시 자식이 언마운트되므로 Tools가 보관. (사용자 동작은 버튼 클릭 한 번이 전부)
  const [preset, setPreset] = useState(null)
  const sendToBacktest = (payload) => { setPreset(payload); setSp({ tab: 'backtest' }) }

  return (
    <div className="space-y-4">
      <PageHeader
        title="전략 도구"
        description="종목·전략을 직접 골라 돌리는 정량 분석 — 포트폴리오 최적화 → 백테스트 → 비교"
      />
      <div className="text-xs text-gray-500 bg-brand-50 border border-brand-100 rounded-md px-3.5 py-2.5 leading-relaxed">
        <b className="text-brand-700">최적화 → 검증 → 비교</b> 흐름의 워크스페이스입니다.
        <b>포트폴리오 최적화</b>에서 위험 대비 최적 비중을 구하고 → <b>백테스트</b>로 과거 성과를 검증하고 → <b>비교</b>로 종목 수익률을 나란히 봅니다.
        <span className="text-gray-400"> (포트폴리오 최적화의 ★/◆ 비중은 [이 비중으로 백테스트] 버튼으로 바로 넘어갑니다)</span>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-px">
        {TAB_META.map(t => (
          <button key={t.id} onClick={() => setSp({ tab: t.id })}
            className={`px-3 py-1.5 text-sm rounded-t font-medium cursor-pointer transition-colors ${
              tabId === t.id ? 'bg-white border border-gray-200 border-b-white text-brand-600 -mb-px' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {tabId === 'portfolio' && <PortfolioSection onSend={sendToBacktest} />}
      {tabId === 'backtest' && <Backtest preset={preset} />}
      {tabId === 'compare' && <Compare />}
    </div>
  )
}
