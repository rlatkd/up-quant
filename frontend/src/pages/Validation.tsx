import { useState } from 'react'
import { useTickers } from '../hooks/useTickers'
import PageLoading from '../components/ui/PageLoading'
import InfoTooltip from '../components/InfoTooltip'
import CompareBody from './backtest/CompareBody'
import WalkForwardBody from './backtest/WalkForwardBody'
import MonteCarloBody from './backtest/MonteCarloBody'

// 검증 · 시뮬레이션 — 전략의 강건성(과최적화)·전망을 점검하는 메타 분석. 전략을 "실행"하는
// 백테스트(/tools/backtest)와 성격이 달라 별도 페이지로 분리. 같은 성격 3종을 선택자로 묶는다.
const METHODS = [
  { key: 'compare',     label: '전략 비교' },
  { key: 'walkforward', label: '워크포워드' },
  { key: 'montecarlo',  label: '몬테카를로' },
]

export default function Validation() {
  const { tickers, loading: tLoading } = useTickers()
  const [method, setMethod] = useState('compare')
  const [market, setMarket] = useState('KRW-BTC')

  if (tLoading) return <PageLoading />

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
          검증 · 시뮬레이션
          <InfoTooltip>
            전략을 "실행"하는 게 아니라, 전략이 <b>강건한지·앞으로 어떨지</b>를 점검합니다. 전략 비교는 여러 전략을 같은 종목에 겹쳐 보고, 워크포워드는 인샘플에서 고른 파라미터를 그 다음 구간(out-of-sample)에서만 평가해 과최적화를 거르며, 몬테카를로는 과거 수익률을 부트스트랩해 미래 분포(부채꼴)를 그립니다.
          </InfoTooltip>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {METHODS.map(m => (
            <button key={m.key} onClick={() => setMethod(m.key)}
              className={`px-4 py-1.5 text-sm rounded font-medium cursor-pointer transition-colors ${
                method === m.key ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-[#222c3e] text-gray-500 dark:text-gray-400 hover:bg-gray-200'
              }`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {method === 'walkforward' ? (
        <WalkForwardBody market={market} setMarket={setMarket} tickers={tickers} />
      ) : method === 'montecarlo' ? (
        <MonteCarloBody market={market} setMarket={setMarket} tickers={tickers} />
      ) : (
        <CompareBody market={market} setMarket={setMarket} tickers={tickers} />
      )}
    </div>
  )
}
