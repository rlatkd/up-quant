import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useTickers } from '../hooks/useTickers'

const FILTERS = ['전체', '즐겨찾기', '상승', '하락', '보합']
const FILTER_MAP = { '전체': null, '상승': 'RISE', '하락': 'FALL', '보합': 'EVEN' }

const LS_KEY = 'upquant_favorites'

function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')) }
  catch { return new Set() }
}

function saveFavorites(set) {
  localStorage.setItem(LS_KEY, JSON.stringify([...set]))
}

function StarIcon({ filled }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? '#f59e0b' : 'none'} stroke={filled ? '#f59e0b' : '#d1d5db'} strokeWidth="2">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>
  )
}

function fmtVolume(v) {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + '조'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '억'
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '만'
  return v.toLocaleString()
}

function changeColor(change) {
  if (change === 'RISE') return 'text-red-500'
  if (change === 'FALL') return 'text-blue-500'
  return 'text-gray-600'
}

function Sparkline({ data, change }) {
  const color = change === 'RISE' ? '#ef4444' : change === 'FALL' ? '#3b82f6' : '#9ca3af'
  return (
    <div style={{ width: 80, height: 32 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.map(v => ({ v }))} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          {/* 변동폭이 작아도 보이도록 Y축을 데이터 범위로 타이트하게 (0 기준 X) */}
          <YAxis hide domain={['dataMin', 'dataMax']} />
          {/* 차트가 작아(80×32) 커서 추적 툴팁이 그래프를 덮으므로, 차트 위쪽 바깥에 고정 */}
          <Tooltip
            allowEscapeViewBox={{ x: true, y: true }}
            position={{ x: 0, y: -26 }}
            wrapperStyle={{ pointerEvents: 'none', zIndex: 20 }}
            contentStyle={{ fontSize: 11, padding: '1px 6px', lineHeight: 1.3 }}
            formatter={(v) => v.toLocaleString() + ' KRW'}
            labelFormatter={() => ''}
          />
          <Line type="monotone" dataKey="v" name="가격" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function SortTh({ label, col, sortKey, sortDir, onSort, className = '' }) {
  const active = sortKey === col
  return (
    <th
      className={`px-4 py-2.5 font-medium cursor-pointer select-none hover:text-gray-600 transition-colors ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={active ? 'text-brand-400' : 'text-gray-300'}>
          {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
        </span>
      </span>
    </th>
  )
}

function W52Bar({ current, low, high }) {
  const pct = high > low ? Math.round((current - low) / (high - low) * 100) : 0
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="flex flex-col items-end gap-1.5">
      <span className="text-xs text-gray-500">{clamped}%</span>
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-brand-400" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}

export default function CoinList() {
  const navigate = useNavigate()
  const { tickers, loading: tLoading } = useTickers()
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('전체')
  const [sortKey, setSortKey]     = useState('acc_trade_price_24h')
  const [sortDir, setSortDir]     = useState('desc')
  const [favorites, setFavorites] = useState(loadFavorites)

  const toggleFavorite = useCallback((market, e) => {
    e.stopPropagation()
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(market) ? next.delete(market) : next.add(market)
      saveFavorites(next)
      return next
    })
  }, [])

  if (tLoading) return (
    <div className="py-24 flex justify-center">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )

  function handleSort(col) {
    if (sortKey !== col) {
      setSortKey(col)
      setSortDir('desc')
    } else if (sortDir === 'desc') {
      setSortDir('asc')
    } else {
      setSortKey(null)
    }
  }

  const SORT_FN = {
    korean_name:         (a, b) => a.korean_name.localeCompare(b.korean_name),
    trade_price:         (a, b) => b.trade_price - a.trade_price,
    change_rate:         (a, b) => b.change_rate - a.change_rate,
    acc_trade_price_24h: (a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h,
  }

  const changeVal = FILTER_MAP[filter]
  let rows = tickers.filter(t => {
    if (filter === '즐겨찾기') return favorites.has(t.market)
    const matchFilter = !changeVal || t.change === changeVal
    const matchSearch = t.korean_name.includes(search) || t.market.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  if (sortKey && SORT_FN[sortKey]) {
    const fn = SORT_FN[sortKey]
    rows = [...rows].sort((a, b) => sortDir === 'desc' ? fn(a, b) : -fn(a, b))
  }

  return (
    <div className="space-y-4">

      {/* 코인 테이블 */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          {/* 필터 탭 */}
          <div className="flex gap-1">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${
                  filter === f
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {f}
                {f !== '전체' && (
                  <span className="ml-1 opacity-70">
                    {tickers.filter(t => t.change === FILTER_MAP[f]).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="종목 검색"
            className="border border-gray-200 rounded px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-brand-400 transition-colors"
          />
        </div>

        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
              <th className="px-3 py-2.5 text-center w-8 font-medium"></th>
              <th className="px-4 py-2.5 text-left w-10 font-medium">#</th>
              <SortTh label="종목명" col="korean_name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-left" />
              <SortTh label="현재가"      col="trade_price"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
              <SortTh label="24h 등락"   col="change_rate"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
              <SortTh label="거래대금(24h)" col="acc_trade_price_24h" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
              <th className="px-4 py-2.5 text-center font-medium">1일</th>
              <th className="px-4 py-2.5 text-right font-medium">52주 위치</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.market} onClick={() => navigate(`/coins/${t.market}`)} className="border-t border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                <td className="px-3 py-3 text-center" onClick={e => toggleFavorite(t.market, e)}>
                  <StarIcon filled={favorites.has(t.market)} />
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-800">{t.korean_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{t.market.replace('KRW-', '')}</div>
                </td>
                <td className={`px-4 py-3 text-right text-sm font-medium ${changeColor(t.change)}`}>
                  {t.trade_price.toLocaleString()}
                </td>
                <td className={`px-4 py-3 text-right text-sm font-medium ${changeColor(t.change)}`}>
                  {(t.change_rate > 0 ? '+' : '')}{(t.change_rate * 100).toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-600">
                  {fmtVolume(t.acc_trade_price_24h)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <Sparkline data={t.sparkline} change={t.change} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <W52Bar current={t.trade_price} low={t.w52_low} high={t.w52_high} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  {filter === '즐겨찾기' ? '즐겨찾기한 종목이 없습니다' : '검색 결과가 없습니다'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
