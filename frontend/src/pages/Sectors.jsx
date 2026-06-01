import { useState, useRef, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { useCategoryMonthly, useCategoryCumulative, useCoinStats } from '../hooks/useAnalysis'
import { useTickers } from '../hooks/useTickers'
import { SERIES } from '../theme'
import CartButton from '../components/CartButton'

// 카테고리(섹터)는 업비트 데이터랩 '코인 분류'에서 받아온 가변 목록(한글)이라,
// 색상은 응답 categories 순서대로 팔레트를 매핑한다. 라벨은 섹터명(한글) 그대로 사용.
const CAT_PALETTE = SERIES
const catColor = (categories, cat) => CAT_PALETTE[Math.max(0, categories.indexOf(cat)) % CAT_PALETTE.length]

// 업비트 데이터랩 '코인 분류' 대분류 5개 섹터 설명 (스냅샷 기준 · 신규 상장은 미분류)
const CAT_DESC = {
  '스마트 컨트랙트 플랫폼': '디앱·스마트계약을 구동하는 메인넷 블록체인 (예: ETH·SOL)',
  '인프라': '오라클·확장성·상호운용 등 블록체인을 떠받치는 기반 기술',
  '디파이': '탈중앙 금융 — 탈중앙거래소·대출·스테이킹 등',
  '문화/엔터테인먼트': '게임·NFT·메타버스·콘텐츠 등 엔터테인먼트 영역',
  '밈': '커뮤니티·밈에서 출발한 토큰 (예: DOGE)',
}

function pearson(xs, ys) {
  const n = xs.length
  if (n < 2) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  const dx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0))
  const dy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0))
  return dx * dy ? num / (dx * dy) : 0
}

function CorrHeatmap({ rows, categories }) {
  if (!rows.length || !categories.length) return null
  const matrix = categories.map(a =>
    categories.map(b => {
      const xs = rows.map(r => r[a])
      const ys = rows.map(r => r[b])
      return parseFloat(pearson(xs, ys).toFixed(2))
    })
  )
  // 암호화폐 섹터는 대부분 강하게 동조(0.8~0.95)해 고정 임계값으론 거의 다 같은 색이 된다.
  // → 대각선(자기 자신=1.00)을 빼고, 남은 셀의 실제 min~max 범위에 색 농도를 매핑하는
  //   "상대" 스케일. 좁게 몰린 값도 차이가 보이게 펴진다. (색=절대 강도가 아니라 이 표 안 상대 강도)
  const offDiag = []
  for (let i = 0; i < categories.length; i++)
    for (let j = 0; j < categories.length; j++)
      if (i !== j) offDiag.push(matrix[i][j])
  const lo = offDiag.length ? Math.min(...offDiag) : 0
  const hi = offDiag.length ? Math.max(...offDiag) : 1
  function cellColor(v, isDiag) {
    if (isDiag) return { bg: 'rgba(229,231,235,0.5)', text: '#9ca3af' } // 대각선: 중립 회색
    const t = hi > lo ? (v - lo) / (hi - lo) : 1   // 0=상대적으로 가장 약, 1=가장 강
    const op = 0.1 + 0.75 * t
    return { bg: `rgba(239,68,68,${op})`, text: t > 0.55 ? '#fff' : '#b91c1c' }
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-xs border-collapse">
        <thead>
          <tr>
            <th className="pb-2 pr-3 text-left text-gray-400 font-medium w-40"></th>
            {categories.map(c => (
              <th key={c} className="pb-2 px-2 text-center text-gray-400 font-medium">
                <div className="flex items-center justify-center gap-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(categories, c) }} />
                  {c}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((a, i) => (
            <tr key={a}>
              <td className="pr-3 py-1 text-gray-500 font-medium whitespace-nowrap">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(categories, a) }} />
                  {a}
                </div>
              </td>
              {categories.map((b, j) => {
                const v = matrix[i][j]
                const { bg, text } = cellColor(v, i === j)
                return (
                  <td key={b} className="py-1 px-3 text-center font-semibold rounded" style={{ backgroundColor: bg, color: text }}>
                    {v.toFixed(2)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeatmapCell({ value }) {
  const abs = Math.abs(value)
  const opacity = Math.min(0.8, 0.1 + abs * 0.035)
  const bg = value >= 0 ? `rgba(239,68,68,${opacity})` : `rgba(59,130,246,${opacity})`
  const textClass = value >= 0 ? 'text-red-700' : 'text-blue-700'
  return (
    <td className={`px-3 py-2.5 text-center text-xs font-medium rounded ${textClass}`} style={{ backgroundColor: bg }}>
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </td>
  )
}

const PERIOD_OPTIONS = ['월', '분기', '년']

// 섹터 클릭 시 띄우는 모달 — 소속 종목 리스트(거래대금 desc) + 행 클릭 상세 + 카트 담기.
// ESC·바깥 클릭으로 닫힘. 종목은 useCoinStats(category 포함) + useTickers(현재가) 결합.
function SectorDrilldownModal({ sector, onClose, stats, tickers }) {
  const navigate = useNavigate()

  // ESC로 닫기
  useEffect(() => {
    if (!sector) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sector, onClose])

  const rows = useMemo(() => {
    if (!sector) return []
    const tickerByMarket = Object.fromEntries(tickers.map(t => [t.market, t]))
    return stats
      .filter(s => s.category === sector)
      .map(s => ({ ...s, ticker: tickerByMarket[s.market] }))
      .filter(s => s.ticker)
      .sort((a, b) => b.ticker.acc_trade_price_24h - a.ticker.acc_trade_price_24h)
  }, [sector, stats, tickers])

  if (!sector) return null

  const avgReturn = rows.length
    ? rows.reduce((s, r) => s + r.return_1m, 0) / rows.length
    : 0
  const totalVolume = rows.reduce((s, r) => s + r.ticker.acc_trade_price_24h, 0)

  const goCoin = (m) => { onClose(); navigate(`/coins/${m}`) }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-gray-800">{sector}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {rows.length}종 · 1개월 평균 수익률
              <span className={`ml-1 font-medium ${avgReturn > 0 ? 'text-red-500' : avgReturn < 0 ? 'text-blue-500' : 'text-gray-500'}`}>
                {avgReturn > 0 ? '+' : ''}{avgReturn.toFixed(2)}%
              </span>
              <span className="text-gray-300 mx-1.5">·</span>
              24h 총 거래대금 {Math.round(totalVolume / 1e8).toLocaleString()}억 KRW
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 text-2xl leading-none cursor-pointer">×</button>
        </div>

        {/* 종목 표 */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">소속 종목 없음</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 text-xs text-gray-400 z-10">
                <tr>
                  <th className="w-6"></th>
                  <th className="px-3 py-2 text-left font-medium">종목</th>
                  <th className="px-3 py-2 text-right font-medium">현재가</th>
                  <th className="px-3 py-2 text-right font-medium">전일대비</th>
                  <th className="px-3 py-2 text-right font-medium">1개월</th>
                  <th className="px-3 py-2 text-right font-medium">거래대금(24h)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const t = r.ticker
                  const cChange = t.change === 'RISE' ? 'text-red-500' : t.change === 'FALL' ? 'text-blue-500' : 'text-gray-600'
                  const c1m = r.return_1m > 0 ? 'text-red-500' : r.return_1m < 0 ? 'text-blue-500' : 'text-gray-500'
                  return (
                    <tr
                      key={r.market}
                      onClick={() => goCoin(r.market)}
                      className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="pl-2 pr-1 py-2 text-center"><CartButton market={r.market} /></td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800">{r.market.replace('KRW-', '')}</div>
                        <div className="text-[11px] text-gray-400">{r.korean_name}</div>
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${cChange}`}>
                        {t.trade_price.toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${cChange}`}>
                        {(t.change_rate > 0 ? '+' : '') + (t.change_rate * 100).toFixed(2)}%
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${c1m}`}>
                        {(r.return_1m > 0 ? '+' : '') + r.return_1m.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 tabular-nums">
                        {Math.round(t.acc_trade_price_24h / 1e8).toLocaleString()}억
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// 카테고리별 누적 수익률 라인 차트.
// recharts 기본 툴팁은 가장 가까운 데이터 점에 "스냅"(중점에서 값이 툭 바뀜)하지만,
// 여기선 마우스 x를 픽셀→데이터 좌표로 역변환해 두 점 사이를 **선형 보간**한 값을
// 연속적으로 보여준다. 보간이 정확하려면 플롯 영역의 좌/우 픽셀 경계를 알아야 하므로
// YAxis 폭·margin을 고정한다.
// ⚠️ 실데이터는 월 단위 점이며, 라인은 type="natural"(자연 스플라인 곡선)으로 그린다.
// 곡선은 점 사이를 매끄럽게 잇는 시각적 보간일 뿐 추가 데이터가 아니다. natural은 보기 좋지만
// 구간 중간에서 실제 월별 값보다 위/아래로 다소 출렁일(오버슈트) 수 있다(없던 고점/저점처럼 보임).
// 또 그려진 곡선값과 툴팁의 선형 보간값도 구간 중간에서 달라지므로, 툴팁 라벨에 "부근"(근사)을 명시한다.
const CUM_MARGIN = { top: 4, right: 20, bottom: 0, left: 0 }
const CUM_YAXIS_W = 48

const CUM_BASE_H = 380       // 기본 높이(px) — 세로로 크게(라인 간격 확보)
const CUM_ZOOM_STEP = 0.5
const CUM_ZOOM_MAX = 3

function CumulativeChart({ rows, categories }) {
  const wrapRef = useRef(null)
  const [hover, setHover] = useState(null) // { x, w, label, items:[{cat,color,value}] }
  const [zoom, setZoom] = useState(1)      // 세로 확대 배율(가로는 항상 100%)
  const n = rows.length
  const chartH = Math.round(CUM_BASE_H * zoom)

  function handleMove(e) {
    if (n < 2 || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const plotLeft = CUM_MARGIN.left + CUM_YAXIS_W
    const plotRight = rect.width - CUM_MARGIN.right
    if (plotRight <= plotLeft) return
    const mx = Math.max(plotLeft, Math.min(plotRight, e.clientX - rect.left))
    const dataX = (mx - plotLeft) / (plotRight - plotLeft) * (n - 1)
    const i0 = Math.floor(dataX)
    const i1 = Math.min(n - 1, i0 + 1)
    const t = dataX - i0
    const items = categories.map(cat => ({
      cat,
      color: catColor(categories, cat),
      value: rows[i0][cat] + (rows[i1][cat] - rows[i0][cat]) * t,
    }))
    setHover({ x: mx, w: rect.width, label: rows[Math.round(dataX)]?.label ?? '', items })
  }

  // 표시 눈금: 점이 많으면(>8) 한 칸 걸러, 적으면 전부
  const ticks = rows.map((_, i) => i).filter(i => n <= 8 || i % 2 === 0)

  const BOX_W = 150
  const boxLeft = hover
    ? (hover.x + 12 + BOX_W > hover.w ? Math.max(0, hover.x - BOX_W - 12) : hover.x + 12)
    : 0

  return (
    <div>
      {/* 세로 확대 컨트롤 (가로 폭은 100% 고정, 높이만 키워 라인 간격을 벌림) */}
      <div className="flex items-center justify-end gap-1.5 mb-1 text-xs text-gray-500">
        <span>세로 확대</span>
        <button
          type="button"
          onClick={() => setZoom(z => Math.max(1, +(z - CUM_ZOOM_STEP).toFixed(1)))}
          disabled={zoom <= 1}
          className="w-6 h-6 rounded border border-gray-200 text-gray-600 leading-none cursor-pointer hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >−</button>
        <span className="w-8 text-center tabular-nums text-gray-600">{zoom.toFixed(1)}x</span>
        <button
          type="button"
          onClick={() => setZoom(z => Math.min(CUM_ZOOM_MAX, +(z + CUM_ZOOM_STEP).toFixed(1)))}
          disabled={zoom >= CUM_ZOOM_MAX}
          className="w-6 h-6 rounded border border-gray-200 text-gray-600 leading-none cursor-pointer hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >+</button>
      </div>
      <div ref={wrapRef} className="relative" onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
      <ResponsiveContainer width="100%" height={chartH}>
        <LineChart data={rows.map((r, i) => ({ ...r, idx: i }))} margin={CUM_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="idx" type="number" domain={[0, n - 1]}
            ticks={ticks} tickFormatter={i => rows[i]?.label ?? ''}
            tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false}
          />
          <YAxis
            width={CUM_YAXIS_W}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickFormatter={v => v + '%'}
            // 자동 스케일이 데이터 끝에 딱 맞아 라인이 위/아래 모서리에 붙으므로, 양쪽에 여유(10단위 반올림 + 헤드룸)를 준다.
            domain={[
              (dmin) => Math.floor((Math.min(0, dmin) * 1.3 - 5) / 10) * 10,
              (dmax) => Math.ceil((dmax * 1.2 + 5) / 10) * 10,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
          {categories.map(cat => (
            <Line
              key={cat}
              type="natural"
              dataKey={cat}
              stroke={catColor(categories, cat)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {hover && (
        <>
          <div
            className="absolute pointer-events-none"
            style={{ left: hover.x, top: CUM_MARGIN.top, bottom: 30, width: 1, background: '#9ca3af' }}
          />
          <div
            className="absolute pointer-events-none bg-white border border-gray-200 rounded shadow-sm px-2.5 py-2"
            style={{ top: 4, left: boxLeft, width: BOX_W }}
          >
            <div className="text-[11px] text-gray-400 mb-1">{hover.label} 부근</div>
            {hover.items.map(it => (
              <div key={it.cat} className="flex items-center justify-between gap-2 text-xs leading-5">
                <span className="flex items-center gap-1 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: it.color }} />
                  <span className="truncate text-gray-600">{it.cat}</span>
                </span>
                <span className="font-medium text-gray-800 flex-shrink-0">{it.value.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
      </div>
    </div>
  )
}

export default function Sectors() {
  const [cumPeriod, setCumPeriod] = useState('월')
  const [activeSector, setActiveSector] = useState(null)  // 모달용 — 클릭된 섹터명
  const { data: monthly, loading: monthlyLoading } = useCategoryMonthly()
  const { data: cumulative, loading: cumLoading } = useCategoryCumulative(cumPeriod)
  // 드릴다운 모달에서 쓸 데이터 — coinStats(category 포함) + tickers(현재가)
  const { data: coinStats } = useCoinStats()
  const { tickers } = useTickers()

  if (monthlyLoading) {
    return (
      <div className="py-24 flex justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Category descriptions — 클릭 시 소속 종목 드릴다운 모달 */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 mb-1">섹터 안내</div>
        <div className="text-xs text-gray-400 mb-4">
          업비트 데이터랩 '코인 분류' 대분류 기준 · <span className="text-brand-500">섹터를 클릭</span>하면 소속 종목 리스트를 봅니다
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
          {monthly.categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveSector(cat)}
              className="flex items-start gap-2 text-left p-2 -m-2 rounded-md hover:bg-gray-50 cursor-pointer transition-colors group"
            >
              <div className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(monthly.categories, cat) }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-700 group-hover:text-brand-600 transition-colors">
                  {cat}
                  <span className="ml-1.5 text-[11px] text-gray-300 group-hover:text-brand-400">→</span>
                </div>
                <div className="text-xs text-gray-500">{CAT_DESC[cat] ?? '—'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Cumulative returns */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-semibold text-gray-700">카테고리별 누적 수익률</div>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p}
                onClick={() => setCumPeriod(p)}
                className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${
                  cumPeriod === p
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-gray-400 mb-4">기간 첫 구간 대비 누적 등락률 (%) · 섹터 소속 종목 동일가중 월봉 집계</div>
        {cumLoading ? (
          <div className="h-[220px] flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : (
          <CumulativeChart rows={cumulative.rows} categories={cumulative.categories} />
        )}
      </div>

      {/* Monthly heatmap */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
          <div className="text-sm font-semibold text-gray-700 mb-1">월별 카테고리 수익률</div>
          <div className="text-xs text-gray-400 mb-4">각 섹터 소속 종목의 해당 월 평균 등락률 (%)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-3 w-40">카테고리</th>
                  {monthly.rows.map(row => (
                    <th key={row.label} className="text-center text-xs text-gray-400 font-medium pb-2 px-1">
                      {row.label.slice(2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly.categories.map(cat => (
                  <tr key={cat}>
                    <td className="text-xs font-medium text-gray-600 py-1 pr-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(monthly.categories, cat) }} />
                        {cat}
                      </div>
                    </td>
                    {monthly.rows.map(row => (
                      <HeatmapCell key={row.label} value={row[cat]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      {/* 카테고리 상관관계 히트맵 (월별 수익률로 계산한 파생이라 월별 다음에 배치) */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-sm font-semibold text-gray-700">카테고리 상관관계</div>
          <Link to="/structure#network" className="text-xs text-brand-600 hover:underline">종목 단위 상관 네트워크 →</Link>
        </div>
        <div className="text-xs text-gray-400 mb-4">최근 6개월 섹터 수익률 기반 피어슨 상관계수 (-1 ~ +1) · 색은 표 안에서의 상대 강도 · 종목 단위는 분석 → 상관 네트워크</div>
        <CorrHeatmap rows={monthly.rows} categories={monthly.categories} />
      </div>

      {/* 섹터 드릴다운 모달 — activeSector 있을 때만 렌더 */}
      <SectorDrilldownModal
        sector={activeSector}
        onClose={() => setActiveSector(null)}
        stats={coinStats}
        tickers={tickers}
      />
    </div>
  )
}
