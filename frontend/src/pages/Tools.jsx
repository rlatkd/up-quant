import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader'
import { PortfolioSection, GarchSection } from './Analysis'
import Backtest from './Backtest'
import Compare from './Compare'

// 도구(Tools) = "내가 종목/전략을 골라 돌리는" 설정형 분석. 헤더 "도구" 드롭다운으로 진입.
// 관찰형(시장 전체 자동 분석)은 Analysis.jsx(분석 탭)에 분리.
// 포트폴리오 통합 동선: 효율적 경계선(최적 비중 산출) → 백테스트(검증) → 비교 가 한 허브 안에 있음.
const TABS = [
  { id: 'portfolio', label: '포트폴리오 최적화', Comp: PortfolioSection },
  { id: 'backtest', label: '백테스트', Comp: Backtest },
  { id: 'compare', label: '비교', Comp: Compare },
  { id: 'garch', label: '변동성(GARCH)', Comp: GarchSection },
]

export default function Tools() {
  const [sp, setSp] = useSearchParams()
  const tabId = sp.get('tab') || 'portfolio'
  const active = TABS.find(t => t.id === tabId) ?? TABS[0]
  const Active = active.Comp
  return (
    <div className="space-y-4">
      <PageHeader
        title="도구"
        description="종목·전략을 직접 골라 돌리는 정량 분석 — 포트폴리오 최적화·백테스트·비교·변동성(GARCH)"
      />
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-px">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setSp({ tab: t.id })}
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
