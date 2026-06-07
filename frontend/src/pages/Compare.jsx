import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { useTickers } from '../hooks/useTickers'
import PageLoading from '../components/ui/PageLoading'
import api from '../api/client'
import InfoTooltip from '../components/InfoTooltip'

import { SERIES as COLORS } from '../theme'

// Y축 기준선 — 기본 [-30, 50]을 항상 보장해 일반 종목 토글 시 축이 흔들리지 않게 하되,
// 극단 급등/급락 종목이 범위를 벗어나면 그만큼만 확장한다(잘라내지 않음 + 안정성 절충).
const Y_BASE = [-30, 50]

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )
}

export default function Compare() {
  const { tickers, loading: tLoading } = useTickers()
  // 진입 즉시 결과가 보이도록 메이저 3종(BTC·ETH·XRP)으로 시작. 이후 사용자가 종목을 토글한다.
  const [selected, setSelected] = useState(['KRW-BTC', 'KRW-ETH', 'KRW-XRP'])
  const [query, setQuery] = useState('')
  // 종목별 캔들을 캐시해 두고, 선택이 바뀌어도 이미 받은 종목은 재요청하지 않는다.
  const [candlesByMarket, setCandlesByMarket] = useState({})
  // 로딩 상태는 별도 state 없이 (선택된 종목 중 아직 캐시에 없는 게 있는지)로 파생
  // — effect 안 setLoadingChart(true) 제거하여 cascading render 회피.
  const loadingChart = selected.some(m => !candlesByMarket[m])

  function toggleMarket(market) {
    setSelected(prev =>
      prev.includes(market) ? prev.filter(m => m !== market) : prev.length < 5 ? [...prev, market] : prev
    )
  }

  // 종목이 많아 검색으로 추리고, 스크롤 그리드에서 고른다.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tickers
    return tickers.filter(t =>
      t.market.toLowerCase().includes(q) || t.korean_name.toLowerCase().includes(q)
    )
  }, [tickers, query])

  // 새로 선택된(아직 캐시에 없는) 종목만 가져와 캐시에 누적한다.
  // loadingChart는 위에서 파생되므로 여기선 데이터만 받아 setState 한 번만.
  useEffect(() => {
    const missing = selected.filter(m => !candlesByMarket[m])
    if (missing.length === 0) return
    let cancelled = false

    Promise.all(
      missing.map(m => api.get(`/api/candles/${m}`, { params: { interval: 'days', count: 90 } }).then(r => ({ market: m, candles: r.data })))
    ).then(results => {
      if (cancelled) return
      setCandlesByMarket(prev => {
        const next = { ...prev }
        results.forEach(({ market, candles }) => { next[market] = candles })
        return next
      })
    })
    return () => { cancelled = true }
  }, [selected, candlesByMarket])

  // 캐시된 캔들로부터 현재 선택된 종목들의 누적 등락률을 구성한다.
  const chartData = useMemo(() => {
    const active = selected
      .map(m => ({ market: m, candles: candlesByMarket[m] }))
      .filter(x => x.candles && x.candles.length)
    if (active.length === 0) return []

    const minLen = Math.min(...active.map(x => x.candles.length))
    const rows = []
    for (let i = 0; i < minLen; i++) {
      const row = { time: new Date(active[0].candles[i].timestamp).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) }
      active.forEach(({ market, candles }) => {
        const base  = candles[0].close
        const close = candles[i].close
        row[market] = parseFloat(((close - base) / base * 100).toFixed(2))
      })
      rows.push(row)
    }
    return rows
  }, [selected, candlesByMarket])

  // 기본 [-30,50]을 보장하되 데이터가 벗어나면 10단위로 확장 (극단값 잘림 방지).
  const yDomain = useMemo(() => {
    if (chartData.length === 0) return Y_BASE
    let lo = Y_BASE[0], hi = Y_BASE[1]
    chartData.forEach(row => selected.forEach(m => {
      const v = row[m]
      if (typeof v === 'number') { lo = Math.min(lo, v); hi = Math.max(hi, v) }
    }))
    return [Math.floor(lo / 10) * 10, Math.ceil(hi / 10) * 10]
  }, [chartData, selected])

  if (tLoading) return <PageLoading />

  return (
    <div className="space-y-4">

      {/* 코인 선택 */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-gray-700">
              종목 선택
              <InfoTooltip>
                여러 종목의 최근 90일 수익률을 같은 출발선(0%)에서 겹쳐 비교합니다. 아래 그리드에서 최대 5개까지 클릭해 선택/해제하고, 검색창으로 종목을 찾을 수 있습니다. 선택한 종목은 고유 색 라인으로 표시되며, 칩의 ✕로도 해제됩니다. 기본으로 BTC·ETH·XRP가 선택돼 있습니다.
              </InfoTooltip>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">최대 5개 · {selected.length}/5 선택됨</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="종목 검색 (코드·한글명)"
              className="border border-gray-200 rounded px-2.5 py-1.5 text-sm w-48 focus:outline-none focus:border-brand-400"
            />
            {selected.length > 0 && (
              <button
                onClick={() => setSelected([])}
                className="px-3 py-1.5 text-sm text-gray-400 cursor-pointer hover:text-gray-600 transition-colors"
              >
                초기화
              </button>
            )}
          </div>
        </div>

        {/* 선택된 종목 칩 (라인 색상과 매칭, 클릭 시 해제) */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selected.map((m, i) => (
              <button
                key={m}
                onClick={() => toggleMarket(m)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white cursor-pointer"
                style={{ backgroundColor: COLORS[i] }}
              >
                {m.replace('KRW-', '')}
                <span className="opacity-80">✕</span>
              </button>
            ))}
          </div>
        )}

        {/* 스크롤 그리드 */}
        <div className="max-h-56 overflow-y-auto border border-gray-100 rounded">
          <div className="grid grid-cols-4 gap-1 p-2">
            {filtered.map(t => {
              const isSelected = selected.includes(t.market)
              const disabled = !isSelected && selected.length >= 5
              return (
                <button
                  key={t.market}
                  onClick={() => toggleMarket(t.market)}
                  disabled={disabled}
                  className={`flex flex-col items-start px-2.5 py-1.5 rounded text-left border cursor-pointer disabled:cursor-not-allowed transition-colors ${
                    isSelected
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-transparent hover:bg-gray-50 disabled:opacity-40'
                  }`}
                >
                  <span className="text-xs font-medium text-gray-800">{t.market.replace('KRW-', '')}</span>
                  <span className="text-xs text-gray-400 truncate w-full">{t.korean_name}</span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="col-span-4 text-center text-xs text-gray-400 py-6">검색 결과 없음</div>
            )}
          </div>
        </div>
      </div>

      {/* 비교 차트 */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="text-sm font-semibold text-gray-700">수익률 비교</div>
          {loadingChart && chartData.length > 0 && (
            <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
          )}
        </div>
        <div className="text-xs text-gray-400 mb-4">90일 기준 초기값 대비 누적 등락률 (%)</div>
        {selected.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-gray-400">종목을 선택하세요</div>
        ) : chartData.length === 0 ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={14} />
              <YAxis domain={yDomain} tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v + '%'} />
              <Tooltip formatter={(v, name) => [v.toFixed(2) + '%', name.replace('KRW-', '')]} contentStyle={{ fontSize: 12 }} />
              <Legend formatter={name => name.replace('KRW-', '')} wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              {selected.map((m, i) => (
                <Line key={m} type="monotone" dataKey={m} stroke={COLORS[i]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
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
              <div key={m} className="bg-white border border-gray-200 rounded-md p-4">
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
                    <span className={`font-medium ${maxVal >= 0 ? 'text-red-500' : 'text-blue-500'}`}>{maxVal >= 0 ? '+' : ''}{maxVal.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">최저 수익률</span>
                    <span className={`font-medium ${minVal >= 0 ? 'text-red-500' : 'text-blue-500'}`}>{minVal >= 0 ? '+' : ''}{minVal.toFixed(2)}%</span>
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
