import { useState, useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import PageLoading from '../../components/ui/PageLoading'
import { runCompare } from '../../api/backtest'
import { MetricCard, MarketSelect } from './parts'
import type { Ticker } from '../../types'

// 다중 전략 겹쳐 비교 — 한 종목에 MA·RSI를 동시에 돌려 자산곡선을 겹쳐 본다.
export default function CompareBody({ market, setMarket, tickers, onReady }: { market: string; setMarket: Dispatch<SetStateAction<string>>; tickers: Ticker[]; onReady?: () => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const run = () => { setLoading(true); return runCompare({ market, count: 200 }).then(setData).finally(() => setLoading(false)) }
  useEffect(() => { Promise.resolve().then(run).finally(() => onReady?.()) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = data ? data.times.map((t: any, i: any) => ({
    time: new Date(t * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    ma: data.strategies[0].equity[i],
    rsi: data.strategies[1].equity[i],
    benchmark: data.benchmark[i],
    benchmark_btc: data.benchmark_btc[i],
  })) : []

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5 flex items-end gap-3">
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">종목</div>
          <MarketSelect market={market} setMarket={setMarket} tickers={tickers} />
        </div>
        <button onClick={run} disabled={loading}
          className="px-4 py-2 rounded-md bg-brand-500 text-white text-sm font-medium cursor-pointer hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {loading ? '실행 중…' : '비교 실행'}
        </button>
        <div className="text-xs text-gray-400 dark:text-gray-500 ml-auto">최근 200일 · 거래비용 5bps</div>
      </div>

      {loading && !data ? <PageLoading /> : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.strategies.map((s: any, i: any) => (
              <MetricCard key={s.name} label={s.name}
                value={(s.total_return >= 0 ? '+' : '') + s.total_return.toFixed(2) + '%'}
                color={s.total_return >= 0 ? 'text-red-500' : 'text-blue-500'}
                sub={i === 0 ? '추세추종' : '평균회귀'} />
            ))}
            <MetricCard label="매수보유" value={(data.benchmark.at(-1) - 100).toFixed(2) + '%'} sub="같은 종목" />
            <MetricCard label="BTC 보유" value={(data.benchmark_btc.at(-1) - 100).toFixed(2) + '%'} sub="시장 대표" />
          </div>
          <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-0.5">전략별 자산 곡선</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">초기 100 기준 · MA(파랑)·RSI(주황) vs 매수보유·BTC(점선)</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={Math.floor(chartData.length / 8)} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ fontSize: 12 }}
                  formatter={(v: any, n: any) => [v.toFixed(2), n === 'ma' ? 'MA 크로스' : n === 'rsi' ? 'RSI 역추세' : n === 'benchmark' ? '매수보유' : 'BTC 보유']} />
                <ReferenceLine y={100} stroke="#e5e7eb" />
                <Line type="monotone" dataKey="ma" stroke="#1763b6" strokeWidth={2} dot={false} name="ma" />
                <Line type="monotone" dataKey="rsi" stroke="#e0913c" strokeWidth={2} dot={false} name="rsi" />
                <Line type="monotone" dataKey="benchmark" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="benchmark" />
                <Line type="monotone" dataKey="benchmark_btc" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="2 2" dot={false} name="benchmark_btc" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
