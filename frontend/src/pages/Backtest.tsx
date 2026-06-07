import { useState, useEffect } from 'react'
import { useTickers } from '../hooks/useTickers'
import PageLoading from '../components/ui/PageLoading'
import { runMaCross, runRsi } from '../api/backtest'
import InfoTooltip from '../components/InfoTooltip'
import CompareBody from './backtest/CompareBody'
import WalkForwardBody from './backtest/WalkForwardBody'
import MonteCarloBody from './backtest/MonteCarloBody'
import TsmomBody from './backtest/TsmomBody'
import SingleStrategyBody from './backtest/SingleStrategyBody'
import PortfolioBacktest from './backtest/PortfolioBacktest'

const STRATEGIES = [
  { key: 'ma',  label: 'MA 크로스' },
  { key: 'rsi', label: 'RSI 역추세' },
  { key: 'compare', label: '전략 비교' },
  { key: 'walkforward', label: '워크포워드' },
  { key: 'montecarlo', label: '몬테카를로' },
  { key: 'tsmom', label: '추세추종(TS모멘텀)' },
  { key: 'portfolio', label: '포트폴리오 보유' },
]

export default function Backtest({ preset }) {
  const { tickers, loading: tLoading } = useTickers()
  // 포트폴리오 최적화에서 비중을 넘겨받았으면(preset) '포트폴리오 보유' 전략으로 진입.
  const [strategy, setStrategy] = useState(preset?.weights?.length ? 'portfolio' : 'ma')
  const [market,   setMarket]   = useState('KRW-BTC')
  const [params,   setParams]   = useState({ fast: 5, slow: 20, period: 14, oversold: 30, overbought: 70, count: 200, fee: 5 })
  const [result,   setResult]   = useState(null)
  const [loading,  setLoading]  = useState(false)

  function setParam(key, val) {
    setParams(prev => ({ ...prev, [key]: Number(val) }))
  }

  async function handleRun() {
    setLoading(true)
    try {
      const p = { market, count: params.count, fee_bps: params.fee }
      const data = strategy === 'ma'
        ? await runMaCross({ ...p, fast: params.fast, slow: params.slow })
        : await runRsi({ ...p, period: params.period, oversold: params.oversold, overbought: params.overbought })
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  // 진입 즉시 기본 전략(KRW-BTC·MA 크로스) 결과. ma/rsi만 부모 실행, 나머지는 각 본문이 자체 실행.
  useEffect(() => {
    if (strategy === 'ma' || strategy === 'rsi') Promise.resolve().then(handleRun)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (tLoading) return <PageLoading />

  const equityData = result?.equity.map(e => ({
    time: new Date(e.time * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    value: e.value,
    benchmark: e.benchmark,
    benchmark_btc: e.benchmark_btc,
  })) ?? []

  const tradeData = (result?.trades ?? []).filter(t => t.side === 'SELL')

  return (
    <div className="space-y-4">
      {/* 전략 선택 (공통) */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
          전략 선택
          <InfoTooltip>
            과거 일봉으로 전략을 시뮬레이션합니다. MA 크로스·RSI는 단일 종목 매매 전략, 추세추종은 다종목 시계열 모멘텀, 포트폴리오 보유는 여러 종목을 비중대로 들고 있었을 때의 성과를 봅니다.
          </InfoTooltip>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STRATEGIES.map(s => (
            <button key={s.key} onClick={() => setStrategy(s.key)}
              className={`px-4 py-1.5 text-sm rounded font-medium cursor-pointer transition-colors ${
                strategy === s.key ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-[#222c3e] text-gray-500 dark:text-gray-400 hover:bg-gray-200'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {strategy === 'portfolio' ? (
        <PortfolioBacktest tickers={tickers} preset={preset} />
      ) : strategy === 'compare' ? (
        <CompareBody market={market} setMarket={setMarket} tickers={tickers} />
      ) : strategy === 'walkforward' ? (
        <WalkForwardBody market={market} setMarket={setMarket} tickers={tickers} />
      ) : strategy === 'montecarlo' ? (
        <MonteCarloBody market={market} setMarket={setMarket} tickers={tickers} />
      ) : strategy === 'tsmom' ? (
        <TsmomBody />
      ) : (
        <SingleStrategyBody
          strategy={strategy} market={market} setMarket={setMarket} tickers={tickers}
          params={params} setParam={setParam} loading={loading} handleRun={handleRun}
          result={result} equityData={equityData} tradeData={tradeData}
        />
      )}
    </div>
  )
}
