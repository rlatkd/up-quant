import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, ZAxis, ReferenceLine, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { useTickers } from '../hooks/useTickers'
import { useCategoryMonthly, useCategoryCumulative, useCoinStats } from '../hooks/useAnalysis'
import { SERIES, DOM_COLORS } from '../theme'
import PageHeader from '../components/ui/PageHeader'

// 카테고리(섹터)는 업비트 데이터랩 '코인 분류'에서 받아온 가변 목록(한글)이라,
// 색상은 응답 categories 순서대로 팔레트를 매핑한다. 라벨은 섹터명(한글) 그대로 사용.
const CAT_PALETTE = SERIES
const catColor = (categories, cat) => CAT_PALETTE[Math.max(0, categories.indexOf(cat)) % CAT_PALETTE.length]
const DOM_MAJORS = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL']

// 리스크-수익 산점도에 표시할 거래대금 상위 종목 수 (전체 261종은 점이 너무 많아 산만)
const SCATTER_LIMIT = 30

// 리스크-수익 산점도: 대부분 종목이 모여 있고 일부만 극단값이라,
// 축은 분포 본체(IQR 펜스)까지만 그리고 스케일 밖 종목은 가장자리에 ◆로 따로 표기한다.
// (정확한 값은 호버 툴팁으로 확인 — 굳이 축을 극단값까지 늘리지 않는다)
function quantile(sorted, p) {
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i), hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}
function bulkRange(vals, k = 2) {
  if (!vals.length) return { lo: 0, hi: 1 }
  const s = [...vals].sort((a, b) => a - b)
  const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1
  return {
    lo: Math.max(s[0], q1 - k * iqr),            // 본체 하한 (실데이터 범위 내)
    hi: Math.min(s[s.length - 1], q3 + k * iqr),  // 본체 상한
  }
}
const padDomain = (lo, hi) => { const p = (hi - lo) * 0.05 || 0.5; return [lo - p, hi + p] }

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

const FG_ZONES = [
  { s1: 0,  s2: 25,  color: '#3b82f6', label: '극도 공포' },
  { s1: 25, s2: 45,  color: '#93c5fd', label: '공포' },
  { s1: 45, s2: 55,  color: '#d1d5db', label: '중립' },
  { s1: 55, s2: 75,  color: '#fca5a5', label: '탐욕' },
  { s1: 75, s2: 100, color: '#ef4444', label: '극도 탐욕' },
]

// 전체 원화 콤마 표기 (업비트 톤). 예: 1,832,456,789,012 — "KRW"는 표시부에서 작게 덧붙인다.
const fmtKrw = v => Math.round(v).toLocaleString()

function KpiCard({ label, value, sub, color, valueClass = 'text-2xl' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md px-5 py-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`${valueClass} font-bold ${color || 'text-gray-800'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function HeatmapCell({ value }) {
  const abs = Math.abs(value)
  const opacity = Math.min(0.8, 0.1 + abs * 0.035)
  const bg = value >= 0 ? `rgba(239,68,68,${opacity})` : `rgba(59,130,246,${opacity})`
  const textClass = value >= 0 ? 'text-red-700' : 'text-blue-700'
  return (
    <td className={`px-3 py-2.5 text-center text-xs font-medium ${textClass}`} style={{ backgroundColor: bg }}>
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </td>
  )
}

// 색상 기준 = 1개월 수익률: 상승(빨강)·보합(회색)·하락(파랑), 절대값 클수록 진하게.
// (한국 금융 UI 관습과 일치. Y축이 잘려 ◆로 표기된 종목도 색으로 등락 강도를 알 수 있다)
const lerp = (a, b, t) => Math.round(a + (b - a) * t)
function returnColor(r) {
  const t = Math.min(1, Math.abs(r) / 30)              // ±30%에서 최대 채도
  const base = [148, 163, 184]                          // 보합: slate-400
  const tgt = r >= 0 ? [239, 68, 68] : [59, 130, 246]   // 상승 빨강 / 하락 파랑
  return `rgb(${lerp(base[0], tgt[0], t)}, ${lerp(base[1], tgt[1], t)}, ${lerp(base[2], tgt[2], t)})`
}

function ScatterDot({ cx, cy, payload }) {
  // 종목 수가 많아 라벨은 생략하고 점만 — 이름·값은 호버 툴팁으로 확인.
  // 점 자체는 살짝 키우고(r=5), 정확히 안 짚어도 근처에 들어오면 툴팁이 뜨도록
  // 넓은 투명 히트 영역(r=15)을 깔아둔다. (산점도는 라인처럼 최근접 트리거가 없어 점별로 영역을 넓힌다)
  return (
    <g>
      <circle cx={cx} cy={cy} r={15} fill="transparent" />
      <circle cx={cx} cy={cy} r={5} fill={payload.color} fillOpacity={0.85} stroke="#fff" strokeWidth={0.75} />
    </g>
  )
}

function FearGreedGauge({ score }) {
  const cx = 100, cy = 90, r = 65

  function arc(s1, s2) {
    const a1 = Math.PI * (1 - s1 / 100)
    const a2 = Math.PI * (1 - s2 / 100)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy - r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2)
    const y2 = cy - r * Math.sin(a2)
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
  }

  const zone = FG_ZONES.find(z => score <= z.s2) || FG_ZONES[FG_ZONES.length - 1]
  const needleAngle = Math.PI * (1 - score / 100)
  const nx = cx + (r - 18) * Math.cos(needleAngle)
  const ny = cy - (r - 18) * Math.sin(needleAngle)

  return (
    <svg width="100%" height="138" viewBox="0 0 200 144">
      {FG_ZONES.map(z => (
        <path key={z.s1} d={arc(z.s1, z.s2)} fill="none" stroke={z.color} strokeWidth={14} />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#1f2937" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4.5} fill="#1f2937" />
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize={22} fontWeight="700" fill={zone.color}>{score}</text>
      <text x={cx} y={cy + 45} textAnchor="middle" fontSize={11} fill="#9ca3af">{zone.label}</text>
    </svg>
  )
}

function MarketDominance({ tickers }) {
  const total = tickers.reduce((s, t) => s + t.acc_trade_price_24h, 0)
  const majors = DOM_MAJORS.map(m => {
    const t = tickers.find(x => x.market === m)
    return { name: m.replace('KRW-', ''), value: t ? t.acc_trade_price_24h : 0 }
  })
  const othersValue = tickers
    .filter(t => !DOM_MAJORS.includes(t.market))
    .reduce((s, t) => s + t.acc_trade_price_24h, 0)
  const data = [...majors, { name: '기타', value: othersValue }]

  return (
    <div className="flex items-center justify-center gap-5">
      <PieChart width={120} height={120}>
        <Pie
          data={data}
          cx={55} cy={55}
          innerRadius={34} outerRadius={54}
          dataKey="value"
          isAnimationActive={false}
        >
          {data.map((_, i) => <Cell key={i} fill={DOM_COLORS[i]} />)}
        </Pie>
      </PieChart>
      <div className="flex flex-col gap-2 w-[104px]">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: DOM_COLORS[i] }} />
              <span className="text-xs text-gray-500">{d.name}</span>
            </div>
            <span className="text-xs font-medium text-gray-700">
              {total ? (d.value / total * 100).toFixed(1) : '0'}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MoversFeed({ tickers }) {
  const sorted = [...tickers].sort((a, b) => b.change_rate - a.change_rate)
  const gainers = sorted.slice(0, 5)
  const losers = sorted.slice(-5).reverse()

  return (
    <div className="flex gap-4 flex-1">
      <div className="flex-1">
        <div className="text-xs font-semibold text-red-500 mb-2.5">급등</div>
        <div className="space-y-2">
          {gainers.map(t => (
            <div key={t.market} className="flex justify-between items-center">
              <span className="text-xs text-gray-700 truncate">{t.korean_name}</span>
              <span className="text-xs font-medium text-red-500 ml-2 flex-shrink-0">
                +{(t.change_rate * 100).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="w-px bg-gray-100" />
      <div className="flex-1">
        <div className="text-xs font-semibold text-blue-500 mb-2.5">급락</div>
        <div className="space-y-2">
          {losers.map(t => (
            <div key={t.market} className="flex justify-between items-center">
              <span className="text-xs text-gray-700 truncate">{t.korean_name}</span>
              <span className="text-xs font-medium text-blue-500 ml-2 flex-shrink-0">
                {(t.change_rate * 100).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const PERIOD_OPTIONS = ['월', '분기', '년']

// 카테고리별 누적 수익률 라인 차트.
// recharts 기본 툴팁은 가장 가까운 데이터 점에 "스냅"(중점에서 값이 툭 바뀜)하지만,
// 여기선 마우스 x를 픽셀→데이터 좌표로 역변환해 두 점 사이를 **선형 보간**한 값을
// 연속적으로 보여준다. (라인도 type="linear"라 그려진 선 = 보간값 = 표시값으로 일치)
// 보간이 정확하려면 플롯 영역의 좌/우 픽셀 경계를 알아야 하므로 YAxis 폭·margin을 고정한다.
const CUM_MARGIN = { top: 4, right: 20, bottom: 0, left: 0 }
const CUM_YAXIS_W = 48

function CumulativeChart({ rows, categories }) {
  const wrapRef = useRef(null)
  const [hover, setHover] = useState(null) // { x, w, label, items:[{cat,color,value}] }
  const n = rows.length

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
    <div ref={wrapRef} className="relative" onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows.map((r, i) => ({ ...r, idx: i }))} margin={CUM_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="idx" type="number" domain={[0, n - 1]}
            ticks={ticks} tickFormatter={i => rows[i]?.label ?? ''}
            tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false}
          />
          <YAxis width={CUM_YAXIS_W} tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v + '%'} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
          {categories.map(cat => (
            <Line
              key={cat}
              type="linear"
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
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [cumPeriod, setCumPeriod] = useState('월')
  const { tickers, loading: tickersLoading } = useTickers()
  const { data: monthly, loading: monthlyLoading } = useCategoryMonthly()
  const { data: cumulative, loading: cumLoading } = useCategoryCumulative(cumPeriod)
  const { data: coinStats, loading: statsLoading } = useCoinStats()

  if (tickersLoading || monthlyLoading || statsLoading) {
    return (
      <div className="py-24 flex justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  // KPI
  const totalVolume = tickers.reduce((s, t) => s + t.acc_trade_price_24h, 0)
  const riseCount = tickers.filter(t => t.change === 'RISE').length
  const riseRatio = tickers.length ? (riseCount / tickers.length * 100).toFixed(1) : '0'
  const btc = tickers.find(t => t.market === 'KRW-BTC')
  const btcDom = btc ? (btc.acc_trade_price_24h / totalVolume * 100).toFixed(1) : '0'
  const avgChange = tickers.length
    ? (tickers.reduce((s, t) => s + t.change_rate, 0) / tickers.length * 100)
    : 0
  const avgChangeStr = (avgChange >= 0 ? '+' : '') + avgChange.toFixed(2) + '%'

  // 공포·탐욕 지수 (상승비율 60% + 평균변화율 환산 40%)
  const riseRatioPct = tickers.length ? (riseCount / tickers.length) * 100 : 50
  const changeScore = Math.min(100, Math.max(0, avgChange * 5 + 50))
  const fearGreedScore = Math.round(riseRatioPct * 0.6 + changeScore * 0.4)

  // Scatter: 거래대금 상위 N종만 대상으로, 분포 본체(IQR 펜스 안)만 산점도에 그리고
  // 스케일 밖 종목은 아래 표로 분리한다. (전체 유니버스는 점이 너무 많아 분포가 산만)
  const scatterUniverse = [...coinStats]
    .sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h)
    .slice(0, SCATTER_LIMIT)
  const xR = bulkRange(scatterUniverse.map(s => s.volatility))
  const yR = bulkRange(scatterUniverse.map(s => s.return_1m))
  const isOutlier = s => s.volatility < xR.lo || s.volatility > xR.hi || s.return_1m < yR.lo || s.return_1m > yR.hi
  const inliers = scatterUniverse.filter(s => !isOutlier(s))
  const outliers = [...scatterUniverse.filter(isOutlier)].sort((a, b) => b.return_1m - a.return_1m)
  const scatterPoints = inliers.map(s => ({
    x: s.volatility, y: s.return_1m,
    color: returnColor(s.return_1m),
    name: s.market.replace('KRW-', ''), category: s.category,
  }))
  const xs = inliers.map(s => s.volatility)
  const ys = inliers.map(s => s.return_1m)
  const xDomain = xs.length ? padDomain(Math.min(...xs), Math.max(...xs)) : [0, 5]
  const yDomain = ys.length ? padDomain(Math.min(...ys), Math.max(...ys)) : [-10, 10]

  return (
    <div className="space-y-4">
      <PageHeader title="대시보드" description="업비트 KRW 마켓 전체를 한눈에 보는 요약" />

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="24h 총 거래대금"
          value={<span className="whitespace-nowrap">{fmtKrw(totalVolume)}<span className="text-sm font-medium text-gray-400 ml-1">KRW</span></span>}
          valueClass="text-xl"
        />
        <KpiCard
          label="상승 코인 비율"
          value={riseRatio + '%'}
          sub={`${riseCount} / ${tickers.length} 종목 상승`}
          color="text-red-500"
        />
        <KpiCard label="BTC 도미넌스" value={btcDom + '%'} sub="거래대금 기준" />
        <KpiCard
          label="시장 평균 등락률"
          value={avgChangeStr}
          color={avgChange >= 0 ? 'text-red-500' : 'text-blue-500'}
        />
      </div>

      {/* Fear & Greed | Market Dominance | Movers */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-md p-5">
          <div className="text-sm font-semibold text-gray-700 mb-0.5">공포·탐욕 지수</div>
          <div className="text-xs text-gray-400 mb-3">상승비율 · 평균등락률 기반 시장 심리</div>
          <FearGreedGauge score={fearGreedScore} />
        </div>
        <div className="bg-white border border-gray-200 rounded-md p-5">
          <div className="text-sm font-semibold text-gray-700 mb-0.5">시장 지배력</div>
          <div className="text-xs text-gray-400 mb-3">24h 거래대금 기준</div>
          <MarketDominance tickers={tickers} />
        </div>
        <div className="bg-white border border-gray-200 rounded-md p-5 flex flex-col">
          <div className="text-sm font-semibold text-gray-700 mb-3">급등 · 급락</div>
          <MoversFeed tickers={tickers} />
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
        <div className="text-sm font-semibold text-gray-700 mb-0.5">카테고리 상관관계</div>
        <div className="text-xs text-gray-400 mb-4">최근 6개월 섹터 수익률 기반 피어슨 상관계수 (-1 ~ +1) · 색은 표 안에서의 상대 강도</div>
        <CorrHeatmap rows={monthly.rows} categories={monthly.categories} />
      </div>

      {/* Risk-Return scatter */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
          <div className="text-sm font-semibold text-gray-700 mb-1">리스크-수익 분포</div>
          <div className="text-xs text-gray-400 mb-3">거래대금 상위 {SCATTER_LIMIT}종 · X: 변동성(30일 표준편차) · Y: 1개월 수익률 · 색상: 1개월 수익률(상승 빨강/하락 파랑) · 극단값 종목은 아래 표 (호버로 종목·값)</div>
          <ResponsiveContainer width="100%" height={360}>
            <ScatterChart margin={{ top: 4, right: 24, bottom: 16, left: -4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="x"
                type="number"
                name="변동성"
                domain={xDomain}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickFormatter={v => Math.round(v * 10) / 10 + '%'}
                label={{ value: '변동성 (%)', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#9ca3af' }}
              />
              <YAxis
                dataKey="y"
                type="number"
                name="수익률"
                domain={yDomain}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickFormatter={v => Math.round(v) + '%'}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div className="bg-white border border-gray-200 rounded px-3 py-2 text-xs shadow-sm">
                      <div className="font-semibold text-gray-700 mb-1">{d.name}</div>
                      {d.category && <div className="text-gray-500">{d.category}</div>}
                      <div className="text-gray-600 mt-1">변동성 {d.x}% / 수익률 {d.y > 0 ? '+' : ''}{d.y}%</div>
                    </div>
                  )
                }}
              />
              <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
              <Scatter data={scatterPoints} shape={<ScatterDot />} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex flex-col items-center gap-1 mt-2 text-xs text-gray-400">
            <div className="flex items-center justify-center gap-2">
              <span className="text-blue-500">하락</span>
              <span className="h-2 w-32 rounded-full" style={{ background: 'linear-gradient(to right, #3b82f6, #94a3b8, #ef4444)' }} />
              <span className="text-red-500">상승</span>
            </div>
            <span>1개월 수익률</span>
          </div>

          {/* 스케일 밖(극단값) 종목 — 분포에서 제외하고 표로 정리 */}
          {outliers.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="text-xs font-semibold text-gray-500 mb-2">
                스케일 밖 종목 <span className="text-gray-400 font-normal">({outliers.length}) · 변동성·수익률이 극단적이라 위 분포에서 제외</span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left font-medium py-1 pr-3">종목</th>
                      <th className="text-right font-medium py-1 px-3">변동성</th>
                      <th className="text-right font-medium py-1 pl-3">1개월 수익률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outliers.map(s => (
                      <tr
                        key={s.market}
                        onClick={() => navigate(`/coins/${s.market}`)}
                        className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="py-1.5 pr-3 text-gray-700">
                          <span className="font-medium">{s.market.replace('KRW-', '')}</span>
                          <span className="text-gray-400 ml-1.5">{s.korean_name}</span>
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-600">{s.volatility.toFixed(2)}%</td>
                        <td className={`py-1.5 pl-3 text-right font-medium ${
                          s.return_1m > 0 ? 'text-red-500' : s.return_1m < 0 ? 'text-blue-500' : 'text-gray-400'
                        }`}>
                          {s.return_1m > 0 ? '+' : ''}{s.return_1m.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
    </div>
  )
}
