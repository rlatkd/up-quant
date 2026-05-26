import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, ZAxis, ReferenceLine, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { useTickers } from '../hooks/useTickers'
import { useCategoryMonthly, useCategoryCumulative, useCoinStats } from '../hooks/useAnalysis'

// 카테고리(섹터)는 업비트 데이터랩 '코인 분류'에서 받아온 가변 목록(한글)이라,
// 색상은 응답 categories 순서대로 팔레트를 매핑한다. 라벨은 섹터명(한글) 그대로 사용.
const CAT_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e']
const catColor = (categories, cat) => CAT_PALETTE[Math.max(0, categories.indexOf(cat)) % CAT_PALETTE.length]

const DOM_COLORS = ['#f59e0b', '#6366f1', '#06b6d4', '#10b981', '#9ca3af']
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

// 카테고리 분류는 업비트 데이터랩 '코인 분류' 스냅샷, 수익률은 실 월봉 집계.
function SourceBadge() {
  return <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 text-[10px] font-medium">업비트 분류</span>
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
  function cellColor(v) {
    if (v >= 0.7)  return { bg: 'rgba(239,68,68,0.75)',   text: '#fff' }
    if (v >= 0.3)  return { bg: 'rgba(239,68,68,0.35)',   text: '#b91c1c' }
    if (v >= -0.3) return { bg: 'rgba(209,213,219,0.4)',  text: '#6b7280' }
    if (v >= -0.7) return { bg: 'rgba(59,130,246,0.35)',  text: '#1d4ed8' }
    return           { bg: 'rgba(59,130,246,0.75)',        text: '#fff' }
  }
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr>
          <th className="pb-2 pr-2 text-left text-gray-400 font-medium w-20"></th>
          {categories.map(c => (
            <th key={c} className="pb-2 text-center text-gray-400 font-medium">
              <div className="flex items-center justify-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: catColor(categories, c) }} />
                {c}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {categories.map((a, i) => (
          <tr key={a}>
            <td className="pr-2 py-1 text-gray-500 font-medium">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: catColor(categories, a) }} />
                {a}
              </div>
            </td>
            {categories.map((b, j) => {
              const v = matrix[i][j]
              const { bg, text } = cellColor(v)
              return (
                <td key={b} className="py-1 px-1 text-center font-semibold rounded" style={{ backgroundColor: bg, color: text }}>
                  {v.toFixed(2)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const FG_ZONES = [
  { s1: 0,  s2: 25,  color: '#3b82f6', label: '극도 공포' },
  { s1: 25, s2: 45,  color: '#93c5fd', label: '공포' },
  { s1: 45, s2: 55,  color: '#d1d5db', label: '중립' },
  { s1: 55, s2: 75,  color: '#fca5a5', label: '탐욕' },
  { s1: 75, s2: 100, color: '#ef4444', label: '극도 탐욕' },
]

function fmtBillion(v) {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + '조'
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '억'
  return v.toLocaleString()
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color || 'text-gray-800'}`}>{value}</div>
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
  // 겹쳐도 호버가 쉽도록 넓은 투명 히트 영역을 깔아둔다.
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="transparent" />
      <circle cx={cx} cy={cy} r={3.5} fill={payload.color} fillOpacity={0.8} stroke="#fff" strokeWidth={0.5} />
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
    <svg width="100%" height="110" viewBox="0 0 200 115">
      {FG_ZONES.map(z => (
        <path key={z.s1} d={arc(z.s1, z.s2)} fill="none" stroke={z.color} strokeWidth={14} />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#1f2937" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4.5} fill="#1f2937" />
      <text x={cx} y={cy + 17} textAnchor="middle" fontSize={22} fontWeight="700" fill={zone.color}>{score}</text>
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize={10} fill="#9ca3af">{zone.label}</text>
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
    <div className="flex items-center gap-2">
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
      <div className="flex flex-col gap-2 flex-1">
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
  const gainers = sorted.slice(0, 4)
  const losers = sorted.slice(-4).reverse()

  return (
    <div className="flex gap-4 h-full">
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
// 누적 rows 개수: 월 12 · 분기 12 · 년 5 → 라벨 겹침 방지용 표시 간격
const PERIOD_X_INTERVAL = { 월: 1, 분기: 1, 년: 0 }

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
        <div className="w-8 h-8 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
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
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="24h 총 거래대금" value={fmtBillion(totalVolume)} />
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
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="text-sm font-semibold text-gray-700 mb-0.5">공포·탐욕 지수</div>
          <div className="text-xs text-gray-400 mb-3">상승비율 · 평균등락률 기반 시장 심리</div>
          <FearGreedGauge score={fearGreedScore} />
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="text-sm font-semibold text-gray-700 mb-0.5">시장 지배력</div>
          <div className="text-xs text-gray-400 mb-3">24h 거래대금 기준</div>
          <MarketDominance tickers={tickers} />
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="text-sm font-semibold text-gray-700 mb-3">급등 · 급락</div>
          <MoversFeed tickers={tickers} />
        </div>
      </div>

      {/* Cumulative returns */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-gray-700">카테고리별 누적 수익률</div>
            <SourceBadge />
          </div>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p}
                onClick={() => setCumPeriod(p)}
                className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${
                  cumPeriod === p
                    ? 'bg-indigo-500 text-white'
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
            <div className="w-6 h-6 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cumulative.rows} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                interval={PERIOD_X_INTERVAL[cumPeriod]}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v + '%'} />
              <Tooltip
                formatter={(v, name) => [v.toFixed(2) + '%', name]}
                contentStyle={{ fontSize: 12, borderColor: '#e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
              {cumulative.categories.map(cat => (
                <Line
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stroke={catColor(cumulative.categories, cat)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 카테고리 상관관계 히트맵 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="text-sm font-semibold text-gray-700">카테고리 상관관계</div>
          <SourceBadge />
        </div>
        <div className="text-xs text-gray-400 mb-4">최근 6개월 섹터 수익률 기반 피어슨 상관계수 (-1 ~ +1)</div>
        <CorrHeatmap rows={monthly.rows} categories={monthly.categories} />
      </div>

      {/* Monthly heatmap */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-semibold text-gray-700">월별 카테고리 수익률</div>
            <SourceBadge />
          </div>
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

      {/* Risk-Return scatter */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
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
          <div className="flex items-center justify-center gap-2 mt-2 text-xs text-gray-400">
            <span className="text-blue-500">하락</span>
            <span className="h-2 w-32 rounded-full" style={{ background: 'linear-gradient(to right, #3b82f6, #94a3b8, #ef4444)' }} />
            <span className="text-red-500">상승</span>
            <span className="ml-1">· 1개월 수익률</span>
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
