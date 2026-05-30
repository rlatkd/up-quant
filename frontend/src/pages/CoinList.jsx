import { useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTickers } from '../hooks/useTickers'
import { CoinDetailView } from './CoinDetail'
import CartButton from '../components/CartButton'

// master-detail 레이아웃 — 좌측 메인은 CoinDetailView, 우측은 슬림 코인 리스트.
// /coins는 디폴트로 KRW-BTC, /coins/:market은 해당 코인을 선택 상태로 표시.

const FILTERS = ['전체', '관심', '상승', '하락', '보합']
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
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? '#f59e0b' : 'none'} stroke={filled ? '#f59e0b' : '#d1d5db'} strokeWidth="2">
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

function SortTh({ label, col, sortKey, sortDir, onSort, align = 'right' }) {
  const active = sortKey === col
  const alignClass = align === 'left' ? 'text-left' : 'text-right'
  return (
    <th
      className={`px-2 py-2 font-medium cursor-pointer select-none hover:text-gray-600 transition-colors ${alignClass}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <span className={active ? 'text-brand-400' : 'text-gray-300'}>
          {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
        </span>
      </span>
    </th>
  )
}

const SORT_FN = {
  korean_name:         (a, b) => a.korean_name.localeCompare(b.korean_name),
  trade_price:         (a, b) => b.trade_price - a.trade_price,
  change_rate:         (a, b) => b.change_rate - a.change_rate,
  acc_trade_price_24h: (a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h,
}

export default function CoinList() {
  const navigate = useNavigate()
  const { market: routeMarket } = useParams()
  const { tickers, loading: tLoading } = useTickers()
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('전체')
  const [sortKey, setSortKey]     = useState('acc_trade_price_24h')
  const [sortDir, setSortDir]     = useState('desc')
  const [favorites, setFavorites] = useState(loadFavorites)

  // URL에 market이 없으면 디폴트로 KRW-BTC (랜딩 시 빈 화면 방지)
  const selectedMarket = routeMarket || 'KRW-BTC'

  const toggleFavorite = useCallback((market, e) => {
    e.stopPropagation()
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(market) ? next.delete(market) : next.add(market)
      saveFavorites(next)
      return next
    })
  }, [])

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

  // 정렬·필터·검색은 tickers 갱신마다 다시 도는데, 261종이라 가벼움. useMemo로 묶음.
  const rows = useMemo(() => {
    if (!tickers.length) return []
    const changeVal = FILTER_MAP[filter]
    let r = tickers.filter(t => {
      if (filter === '관심') return favorites.has(t.market)
      const matchFilter = !changeVal || t.change === changeVal
      const matchSearch = t.korean_name.includes(search) || t.market.toLowerCase().includes(search.toLowerCase())
      return matchFilter && matchSearch
    })
    if (sortKey && SORT_FN[sortKey]) {
      const fn = SORT_FN[sortKey]
      r = [...r].sort((a, b) => sortDir === 'desc' ? fn(a, b) : -fn(a, b))
    }
    return r
  }, [tickers, filter, favorites, search, sortKey, sortDir])

  // 좌: 메인 상세 (col 9, ~75%) │ 우: 슬림 코인 리스트 (col 3, ~25%, sticky)
  return (
    <div className="grid grid-cols-12 gap-4 items-start">
      {/* 좌측 메인 — 코인 상세 */}
      <div className="col-span-9 min-w-0">
        <CoinDetailView market={selectedMarket} />
      </div>

      {/* 우측 사이드바 — 코인 리스트 */}
      <aside className="col-span-3 bg-white border border-gray-200 rounded-md overflow-hidden flex flex-col sticky top-[68px] max-h-[calc(100vh-84px)]">
        {/* 검색 */}
        <div className="p-3 border-b border-gray-100 shrink-0">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="코인명/심볼 검색"
            className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand-400 transition-colors"
          />
        </div>

        {/* 필터 탭 (한 줄, 줄바꿈 없음) */}
        <div className="px-3 py-2 border-b border-gray-100 shrink-0 flex gap-1 overflow-x-auto">
          {tLoading ? null : FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors whitespace-nowrap ${
                filter === f
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f}
              {f !== '전체' && f !== '관심' && (
                <span className="ml-1 opacity-70">
                  {tickers.filter(t => t.change === FILTER_MAP[f]).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 정렬 헤더 + 행 리스트 (내부 스크롤) */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 text-gray-400 z-10">
              <tr>
                <th className="px-2 py-2 w-6"></th>
                <th className="px-2 py-2 w-6"></th>
                <SortTh label="한글명"   col="korean_name"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                <SortTh label="현재가"   col="trade_price"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="전일대비" col="change_rate"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="거래대금" col="acc_trade_price_24h"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {tLoading ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400">로딩 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-gray-400">
                    {filter === '관심' ? '관심 종목이 없습니다' : '검색 결과가 없습니다'}
                  </td>
                </tr>
              ) : rows.map(t => {
                const isSelected = t.market === selectedMarket
                return (
                  <tr
                    key={t.market}
                    onClick={() => navigate(`/coins/${t.market}`)}
                    className={`border-t border-gray-50 cursor-pointer transition-colors ${
                      isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-2 py-1.5 text-center" onClick={e => toggleFavorite(t.market, e)}>
                      <StarIcon filled={favorites.has(t.market)} />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <CartButton market={t.market} />
                    </td>
                    <td className="px-2 py-1.5 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{t.korean_name}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{t.market.replace('KRW-', '')}/KRW</div>
                    </td>
                    <td className={`px-2 py-1.5 text-right font-medium tabular-nums ${changeColor(t.change)}`}>
                      {t.trade_price.toLocaleString()}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${changeColor(t.change)}`}>
                      {(t.change_rate > 0 ? '+' : '')}{(t.change_rate * 100).toFixed(2)}%
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-600 tabular-nums">
                      {fmtVolume(t.acc_trade_price_24h)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  )
}
