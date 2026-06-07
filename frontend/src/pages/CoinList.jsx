import { useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTickers } from '../hooks/useTickers'
import { CoinDetailView } from './CoinDetail'
import PageLoading from '../components/ui/PageLoading'
import { LivePrice, LiveChangeRate } from '../components/LiveCells'

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


function SortTh({ label, col, sortKey, sortDir, onSort, align = 'right', widthClass = '' }) {
  const active = sortKey === col
  const alignClass = align === 'left' ? 'text-left' : 'text-right'
  return (
    <th
      className={`px-2 py-2 font-medium cursor-pointer select-none hover:text-gray-600 transition-colors ${alignClass} ${widthClass}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {/* 화살표 자리를 항상 고정폭으로 예약 — 정렬 토글로 화살표가 생겨도 컬럼이 밀리지 않음 */}
        <span className="inline-block w-2.5 text-center text-brand-400">
          {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
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

  // 첫 진입(코인 목록 로딩) 동안은 통짜 로딩. 이후 종목 전환은 좌측 상세가 자체 로딩(master-detail).
  if (tLoading) return <PageLoading />

  // 좌: 메인 상세 (17/24, ~71%) │ 우: 코인 리스트 (7/24, ~29%, sticky) — 8.5:3.5 비율
  // items-start를 두지 않음(기본 stretch) → 우측 사이드바 높이가 좌측 상세 높이에 맞춰진다.
  // (items-start면 우측이 자기 콘텐츠 높이로 grid row를 밀어, 줌 아웃 시 좌측보다 길어져 페이지가 끝없이 늘어남)
  return (
    <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-4">
      {/* 좌측 메인 — 코인 상세 */}
      <div className="col-span-[17] min-w-0">
        <CoinDetailView market={selectedMarket} />
      </div>

      {/* 우측 사이드바 — 코인 리스트.
          wrapper(grid 셀)는 stretch로 좌측 상세 높이가 되고, 그 안 aside를 absolute inset-0로 채운다.
          absolute 자식은 정상 흐름에서 빠져 부모(wrapper) 높이에 기여하지 않으므로, wrapper 높이는 오직
          좌측 상세가 정한다 → 261행 리스트가 페이지를 늘리지 않고 aside 내부에서만 스크롤(줌 배율 무관). */}
      <div className="col-span-[7] relative">
      <aside className="absolute inset-0 bg-white border border-gray-200 rounded-md overflow-hidden flex flex-col">
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
                <SortTh label="한글명"   col="korean_name"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" widthClass="w-20" />
                <SortTh label="현재가"   col="trade_price"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="전일대비" col="change_rate"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="거래대금" col="acc_trade_price_24h"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {tLoading ? (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-gray-400">로딩 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-gray-400">
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
                    <td className="px-2 py-1.5 w-20 max-w-20">
                      <div className="font-medium text-gray-800 truncate">{t.korean_name}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5 truncate">{t.market.replace('KRW-', '')}/KRW</div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <LivePrice ticker={t} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <LiveChangeRate ticker={t} />
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
    </div>
  )
}
