import { useState, useEffect } from 'react'
import { useTickers } from '../hooks/useTickers'
import PageLoading from '../components/ui/PageLoading'
import { runMaCross, runRsi } from '../api/backtest'
import TsmomBody from './backtest/TsmomBody'
import SingleStrategyBody from './backtest/SingleStrategyBody'
import PortfolioBacktest from './backtest/PortfolioBacktest'

// 전략 백테스트(전략 실행) — 실제 매매 규칙을 과거 데이터로 돌려본다. 같은 입력(종목·기간·비용)을
// 공유하며 전략만 갈아끼우는 워크플로라 선택자(selector) 한 페이지가 맞다.
// 검증·시뮬레이션(전략 비교·워크포워드·몬테카를로)은 성격이 달라 별도 페이지(/strategy/validation)로 분리.
const STRATEGIES = [
  { key: 'ma',  label: 'MA 크로스' },
  { key: 'rsi', label: 'RSI 역추세' },
  { key: 'tsmom', label: '추세추종(TSMOM)' },
  { key: 'portfolio', label: '포트폴리오 보유' },
]

export default function Backtest({ strategy: strategyProp, preset }: { strategy?: string; preset?: any }) {
  const { tickers, loading: tLoading } = useTickers()
  // 전략은 URL 경로(/strategy/backtest/:strategy)로 결정 — 헤더 드롭다운이 곧 선택자.
  const strategy = STRATEGIES.find(s => s.key === strategyProp) ? strategyProp! : 'ma'
  const [market,   setMarket]   = useState('KRW-BTC')
  const [params,   setParams]   = useState({ fast: 5, slow: 20, period: 14, oversold: 30, overbought: 70, count: 200, fee: 5, targetVol: 0 })
  const [result,   setResult]   = useState<any>(null)
  const [loading,  setLoading]  = useState(false)

  function setParam(key: any, val: any) {
    setParams(prev => ({ ...prev, [key]: Number(val) }))
  }

  async function handleRun() {
    setLoading(true)
    try {
      const p = { market, count: params.count, fee_bps: params.fee, target_vol: params.targetVol }
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

  const equityData = result?.equity.map((e: any) => ({
    time: new Date(e.time * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    value: e.value,
    benchmark: e.benchmark,
    benchmark_btc: e.benchmark_btc,
  })) ?? []

  const tradeData = (result?.trades ?? []).filter((t: any) => t.side === 'SELL')

  return (
    <div className="space-y-4">
      {strategy === 'portfolio' ? (
        <PortfolioBacktest tickers={tickers} preset={preset} />
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
