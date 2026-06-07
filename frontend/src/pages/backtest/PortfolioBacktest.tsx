import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { runPortfolio } from '../../api/backtest'
import { SERIES } from '../../theme'
import { MetricCard, Spinner } from './parts'
import { raColor } from './helpers'

const REBAL_OPTIONS = [
  { v: 0,  label: '매수보유' },
  { v: 7,  label: '7일 리밸런스' },
  { v: 30, label: '30일 리밸런스' },
]

// 포트폴리오 보유 백테스트 — 종목을 비중대로 들었을 때의 자산 곡선.
// 종목·비중 출처: preset(포트폴리오 최적화에서 넘어온 ★/◆/▲ 비중) > 기본 3종.
export default function PortfolioBacktest({ tickers, preset }) {
  const init = preset?.markets?.length ? preset.markets.slice(0, 10) : ['KRW-BTC', 'KRW-ETH', 'KRW-XRP']
  const [markets, setMarkets] = useState(init)
  const [wmap, setWmap] = useState(() =>
    preset?.markets?.length && preset?.weights?.length
      ? Object.fromEntries(preset.markets.map((m, i) => [m, preset.weights[i] ?? 0]))
      : Object.fromEntries(init.map(m => [m, +(100 / init.length).toFixed(1)]))
  )
  const [rebalance, setRebalance] = useState(0)
  const [count, setCount] = useState(180)
  const [fee, setFee] = useState(5)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const nmap = Object.fromEntries(tickers.map(t => [t.market, t.korean_name]))

  function equalize(ms) {
    const w = +(100 / ms.length).toFixed(1)
    setWmap(Object.fromEntries(ms.map(m => [m, w])))
  }
  function addMarket(m) {
    if (!m || markets.includes(m) || markets.length >= 10) return
    const next = [...markets, m]; setMarkets(next); equalize(next)
  }
  function removeMarket(m) {
    const next = markets.filter(x => x !== m); setMarkets(next); equalize(next)
  }

  async function run() {
    if (markets.length < 1) return
    setLoading(true)
    try {
      const weights = markets.map(m => wmap[m] ?? 0)
      const data = await runPortfolio({ markets, weights, count, rebalance_days: rebalance, fee_bps: fee })
      setResult(data)
    } finally { setLoading(false) }
  }
  useEffect(() => {
    Promise.resolve().then(run)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const equityData = result?.equity.map(e => ({
    time: new Date(e.time * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    value: e.value, benchmark: e.benchmark,
  })) ?? []

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">포트폴리오 구성</div>
        <div className="space-y-1.5 mb-3">
          {markets.map((m, i) => (
            <div key={m} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
              <span className="w-28 text-sm text-gray-700 dark:text-gray-200">{m.replace('KRW-', '')} <span className="text-gray-400 dark:text-gray-500 text-xs">{nmap[m]}</span></span>
              <input type="number" min={0} max={100} value={wmap[m] ?? 0}
                onChange={e => setWmap(prev => ({ ...prev, [m]: Number(e.target.value) }))}
                className="w-20 border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1 text-sm focus:outline-none focus:border-brand-400" />
              <span className="text-xs text-gray-400 dark:text-gray-500">%</span>
              <button onClick={() => removeMarket(m)} className="text-gray-300 hover:text-red-500 text-lg leading-none cursor-pointer ml-1">×</button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value="" onChange={e => addMarket(e.target.value)}
            className="border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer focus:outline-none focus:border-brand-400">
            <option value="">+ 종목 추가</option>
            {tickers.filter(t => !markets.includes(t.market)).slice(0, 80).map(t => (
              <option key={t.market} value={t.market}>{t.market.replace('KRW-', '')} · {t.korean_name}</option>
            ))}
          </select>
          <button onClick={() => equalize(markets)} className="px-2.5 py-1.5 text-xs rounded bg-gray-100 dark:bg-[#222c3e] text-gray-500 dark:text-gray-400 hover:bg-gray-200 cursor-pointer">균등 비중</button>
          <select value={rebalance} onChange={e => setRebalance(Number(e.target.value))}
            className="border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer focus:outline-none focus:border-brand-400">
            {REBAL_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <input type="number" value={count} min={30} max={500} onChange={e => setCount(Number(e.target.value))}
            title="일봉 기간" className="w-24 border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-brand-400" />
          <input type="number" value={fee} min={0} max={100} onChange={e => setFee(Number(e.target.value))}
            title="편도 거래비용(bps) · 진입+리밸런스 회전에 차감" className="w-20 border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-brand-400" placeholder="bps" />
          <button onClick={run} disabled={loading || markets.length < 1}
            className="px-5 py-1.5 bg-brand-500 text-white text-sm font-medium rounded cursor-pointer hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {loading ? '실행 중...' : '백테스트 실행'}
          </button>
        </div>
        <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">※ 비중 합은 자동 정규화 · 마지막 입력칸 = 편도 거래비용(bps, 진입+리밸런스 회전에 차감) · 균등 비중이면 동일가중 벤치마크와 곡선이 겹칩니다.</div>
      </div>

      {loading && <Spinner />}

      {result && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="총 수익률" value={(result.total_return >= 0 ? '+' : '') + result.total_return.toFixed(2) + '%'} color={result.total_return >= 0 ? 'text-red-500' : 'text-blue-500'} />
            <MetricCard label="동일가중 벤치마크" value={(result.benchmark_return >= 0 ? '+' : '') + result.benchmark_return.toFixed(2) + '%'} color={result.benchmark_return >= 0 ? 'text-red-500' : 'text-blue-500'} />
            <MetricCard label="최대 낙폭(MDD)" value={'-' + result.mdd.toFixed(2) + '%'} color="text-blue-500" />
            <MetricCard label="샤프" value={result.sharpe.toFixed(2)} color={raColor(result.sharpe)} />
            <MetricCard label="연율 변동성" value={result.volatility.toFixed(1) + '%'} />
          </div>

          <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-0.5">자산 곡선</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">초기 100 기준 · 포트폴리오 vs 동일가중 벤치마크</div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={equityData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={Math.floor(equityData.length / 8)} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip formatter={(v, n) => [v.toFixed(2), n === 'value' ? '포트폴리오' : '벤치마크']} contentStyle={{ fontSize: 12 }} />
                <ReferenceLine y={100} stroke="#e5e7eb" />
                <Line type="monotone" dataKey="value" stroke="#1763b6" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="benchmark" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">종목별 기여</div>
            <div className="space-y-2">
              {result.contributions.map((c, i) => (
                <div key={c.market} className="flex items-center gap-3 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
                  <span className="w-32 text-gray-700 dark:text-gray-200">{c.market.replace('KRW-', '')} <span className="text-gray-400 dark:text-gray-500 text-xs">{c.korean_name}</span></span>
                  <span className="w-20 text-xs text-gray-500 dark:text-gray-400">비중 {(c.weight * 100).toFixed(1)}%</span>
                  <span className={`w-24 text-right font-medium tabular-nums ${c.asset_return >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                    {(c.asset_return >= 0 ? '+' : '') + c.asset_return.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
