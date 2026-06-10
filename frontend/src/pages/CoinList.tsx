import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTickers } from '../hooks/useTickers'
import { useLiveTickers } from '../contexts/useRealtime'
import { CoinDetailView } from './CoinDetail'
import PageLoading from '../components/ui/PageLoading'
import PageError from '../components/ui/PageError'
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

// 경량 SVG 스파크라인(1일·1시간봉 24개) — recharts 대신 polyline 하나라 261행도 가뿐. 색=등락 방향.
function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) return <span className="inline-block w-10" />
  const w = 40, h = 16
  const min = Math.min(...data), max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 2) - 1}`).join(' ')
  return (
    <svg width={w} height={h} className="block" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? '#ef4444' : '#3b82f6'} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

// 최근 본 코인 — localStorage에 최근 선택 종목을 쌓아 빠른 재이동 바로 보여준다.
const RECENT_KEY = 'upquant_recent_coins'
function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function pushRecent(market: string): string[] {
  const list = [market, ...loadRecent().filter(m => m !== market)].slice(0, 6)  // 최근 6개만 유지
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch { /* ignore */ }
  return list
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
  const { tickers, loading: tLoading, error: tError, retry: tRetry } = useTickers()
  // REST tickers에 실시간 시세를 덮어쓴 배열 — 정렬·필터 카운트·거래대금이 라이브로 갱신된다.
  const liveTickers = useLiveTickers(tickers)
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('전체')
  const [sortKey, setSortKey]     = useState('acc_trade_price_24h')
  const [sortDir, setSortDir]     = useState('desc')
  const [favorites, setFavorites] = useState(loadFavorites)
  const [recent, setRecent]       = useState<string[]>(loadRecent)

  // URL에 market이 없으면 디폴트로 KRW-BTC (랜딩 시 빈 화면 방지)
  const selectedMarket = routeMarket || 'KRW-BTC'

  // 선택 종목이 바뀌면 '최근 본 코인'에 기록(navigation 부수효과 — 의도적 setState)
  useEffect(() => {
    if (selectedMarket) setRecent(pushRecent(selectedMarket))  // eslint-disable-line react-hooks/set-state-in-effect
  }, [selectedMarket])
  const nameOf = useMemo(() => Object.fromEntries(tickers.map(t => [t.market, t.korean_name])), [tickers])

  const toggleFavorite = useCallback((market, e) => {
    e.stopPropagation()
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(market)) next.delete(market)
      else next.add(market)
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

  // 정렬·필터·검색은 실시간 tickers(liveTickers) 기준 → 가격/거래대금이 바뀌면 라이브로 재정렬·재집계.
  const rows = useMemo(() => {
    if (!liveTickers.length) return []
    const changeVal = FILTER_MAP[filter]
    let r = liveTickers.filter(t => {
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
  }, [liveTickers, filter, favorites, search, sortKey, sortDir])

  if (tError) return <PageError onRetry={tRetry} />
  // 첫 진입(코인 목록 로딩) 동안은 통짜 로딩. 이후 종목 전환은 좌측 상세가 자체 로딩(master-detail).
  if (tLoading) return <PageLoading />

  // 좌: 메인 상세 (17/24, ~71%) │ 우: 코인 리스트 (7/24, ~29%, sticky) — 8.5:3.5 비율
  // items-start를 두지 않음(기본 stretch) → 우측 사이드바 높이가 좌측 상세 높이에 맞춰진다.
  // (items-start면 우측이 자기 콘텐츠 높이로 grid row를 밀어, 줌 아웃 시 좌측보다 길어져 페이지가 끝없이 늘어남)
  return (
    <>
      {/* 최근 본 코인 — 화면 왼쪽에 떠 있는 컴팩트 패널(최근 6개). 클릭 시 해당 코인으로 이동. */}
      {recent.length > 1 && (
        <div className="hidden xl:flex flex-col gap-1.5 fixed left-3 top-1/2 -translate-y-1/2 z-30">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1 mb-0.5">최근 본</span>
          {recent.map(m => {
            const active = m === selectedMarket
            return (
              <button key={m} onClick={() => navigate(`/coins/${m}`)} title={nameOf[m] || m}
                className={`w-12 px-1 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer transition-all shadow-sm ${
                  active
                    ? 'bg-brand-500 text-white'
                    : 'bg-white/85 dark:bg-[#1a2234]/85 backdrop-blur border border-gray-200 dark:border-[#2c3850] text-gray-600 dark:text-gray-300 hover:border-brand-400 hover:text-brand-500'
                }`}>
                {m.replace('KRW-', '')}
              </button>
            )
          })}
        </div>
      )}

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
      <aside className="absolute inset-0 bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden flex flex-col">
        {/* 검색 */}
        <div className="p-3 border-b border-gray-100 dark:border-[#232d40] shrink-0">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="코인명/심볼 검색"
            className="w-full border border-gray-200 dark:border-[#2c3850] rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand-400 transition-colors"
          />
        </div>

        {/* 필터 탭 (한 줄, 줄바꿈 없음) */}
        <div className="px-3 py-2 border-b border-gray-100 dark:border-[#232d40] shrink-0 flex gap-1 overflow-x-auto">
          {tLoading ? null : FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors whitespace-nowrap ${
                filter === f
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 dark:bg-[#222c3e] text-gray-500 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              {f}
              {f !== '전체' && f !== '관심' && (
                <span className="ml-1 opacity-70">
                  {liveTickers.filter(t => t.change === FILTER_MAP[f]).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 정렬 헤더 + 행 리스트 (내부 스크롤) */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 dark:bg-[#141b29] border-b border-gray-100 dark:border-[#232d40] text-gray-400 dark:text-gray-500 z-10">
              <tr>
                <th className="px-2 py-2 w-6"></th>
                <SortTh label="한글명"   col="korean_name"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" widthClass="w-20" />
                <SortTh label="현재가"   col="trade_price"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="전일대비" col="change_rate"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                <th className="px-1 py-2 font-medium text-center">1일</th>
                <SortTh label="거래대금" col="acc_trade_price_24h"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {tLoading ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400 dark:text-gray-500">로딩 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-gray-400 dark:text-gray-500">
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
                      <div className="font-medium text-gray-800 dark:text-gray-100 truncate">{t.korean_name}</div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{t.market.replace('KRW-', '')}/KRW</div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <LivePrice ticker={t} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <LiveChangeRate ticker={t} />
                    </td>
                    <td className="px-1 py-1.5">
                      <Sparkline data={t.sparkline} up={t.change_rate >= 0} />
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-600 dark:text-gray-300 tabular-nums">
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
    </>
  )
}
