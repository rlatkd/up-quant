import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { useTickers } from '../hooks/useTickers'
import api from '../api/client'

const COLORS = ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )
}

export default function Compare() {
  const { tickers, loading: tLoading } = useTickers()
  const [selected, setSelected] = useState([])
  const [chartData, setChartData] = useState([])
  const [loadingChart, setLoadingChart] = useState(false)

  function toggleMarket(market) {
    setSelected(prev =>
      prev.includes(market) ? prev.filter(m => m !== market) : prev.length < 5 ? [...prev, market] : prev
    )
  }

  useEffect(() => {
    if (selected.length === 0) { setChartData([]); return }
    setLoadingChart(true)

    Promise.all(
      selected.map(m => api.get(`/api/candles/${m}`, { params: { interval: 'days', count: 90 } }).then(r => ({ market: m, candles: r.data })))
    ).then(results => {
      const minLen = Math.min(...results.map(r => r.candles.length))
      const rows = []
      for (let i = 0; i < minLen; i++) {
        const row = { time: new Date(results[0].candles[i].timestamp).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) }
        results.forEach(({ market, candles }) => {
          const base  = candles[0].close
          const close = candles[i].close
          row[market] = parseFloat(((close - base) / base * 100).toFixed(2))
        })
        rows.push(row)
      }
      setChartData(rows)
    }).finally(() => setLoadingChart(false))
  }, [selected])

  if (tLoading) return <Spinner />

  return (
    <div className="space-y-4">
      {/* 코인 선택 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="text-sm font-semibold text-gray-700 mb-1">종목 선택</div>
        <div className="text-xs text-gray-400 mb-3">최대 5개까지 선택 가능</div>
        <div className="flex flex-wrap gap-2">
          {tickers.map((t, idx) => {
            const selIdx = selected.indexOf(t.market)
            const isSelected = selIdx !== -1
            return (
              <button
                key={t.market}
                onClick={() => toggleMarket(t.market)}
                disabled={!isSelected && selected.length >= 5}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer disabled:cursor-not-allowed transition-colors ${
                  isSelected
                    ? 'text-white border-transparent'
                    : 'text-gray-500 border-gray-200 hover:border-gray-400 disabled:opacity-40'
                }`}
                style={isSelected ? { backgroundColor: COLORS[selIdx] } : {}}
              >
                {t.market.replace('KRW-', '')} {t.korean_name}
              </button>
            )
          })}
        </div>
      </div>

      {/* 비교 차트 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="text-sm font-semibold text-gray-700 mb-0.5">수익률 비교</div>
        <div className="text-xs text-gray-400 mb-4">90일 기준 초기값 대비 누적 등락률 (%)</div>
        {loadingChart ? <Spinner /> : selected.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-gray-400">종목을 선택하세요</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={14} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v + '%'} />
              <Tooltip formatter={(v, name) => [v.toFixed(2) + '%', name.replace('KRW-', '')]} contentStyle={{ fontSize: 12 }} />
              <Legend formatter={name => name.replace('KRW-', '')} wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              {selected.map((m, i) => (
                <Line key={m} type="monotone" dataKey={m} stroke={COLORS[i]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 통계 카드 */}
      {selected.length > 0 && chartData.length > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selected.length}, 1fr)` }}>
          {selected.map((m, i) => {
            const vals   = chartData.map(r => r[m]).filter(v => v !== undefined)
            const last   = vals[vals.length - 1] ?? 0
            const maxVal = Math.max(...vals)
            const minVal = Math.min(...vals)
            const ticker = tickers.find(t => t.market === m)
            return (
              <div key={m} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-sm font-semibold text-gray-700">{m.replace('KRW-', '')}</span>
                  <span className="text-xs text-gray-400">{ticker?.korean_name}</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">90일 수익률</span>
                    <span className={`font-semibold ${last >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                      {last >= 0 ? '+' : ''}{last.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">최고 수익률</span>
                    <span className="font-medium text-red-500">+{maxVal.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">최저 수익률</span>
                    <span className="font-medium text-blue-500">{minVal.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
