import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, ZAxis, ReferenceLine, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { useTickers } from '../hooks/useTickers'
import { useCategoryMonthly, useCategoryCumulative, useCoinStats } from '../hooks/useAnalysis'

const CAT_COLORS = {
  layer1: '#6366f1',
  defi:   '#10b981',
  meme:   '#f59e0b',
  gaming: '#ec4899',
  layer2: '#8b5cf6',
}

const CAT_LABELS = {
  layer1: 'Layer 1',
  defi:   'DeFi',
  meme:   'Meme',
  gaming: 'Gaming',
  layer2: 'Layer 2',
}

const CATS = ['layer1', 'defi', 'meme', 'gaming', 'layer2']

const DOM_COLORS = ['#f59e0b', '#6366f1', '#06b6d4', '#10b981', '#9ca3af']
const DOM_MAJORS = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL']

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

function CorrHeatmap({ monthly }) {
  if (!monthly.length) return null
  const matrix = CATS.map(a =>
    CATS.map(b => {
      const xs = monthly.map(r => r[a])
      const ys = monthly.map(r => r[b])
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
          {CATS.map(c => (
            <th key={c} className="pb-2 text-center text-gray-400 font-medium">
              <div className="flex items-center justify-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CAT_COLORS[c] }} />
                {CAT_LABELS[c]}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {CATS.map((a, i) => (
          <tr key={a}>
            <td className="pr-2 py-1 text-gray-500 font-medium">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CAT_COLORS[a] }} />
                {CAT_LABELS[a]}
              </div>
            </td>
            {CATS.map((b, j) => {
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

function ScatterDot({ cx, cy, payload }) {
  const color = CAT_COLORS[payload.category] || '#94a3b8'
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill={color} fillOpacity={0.85} stroke={color} strokeWidth={1} />
      <text x={cx + 7} y={cy + 4} fontSize={10} fill="#6b7280">{payload.name}</text>
    </g>
  )
}

function CatLegend() {
  return (
    <div className="flex gap-4 mt-2">
      {CATS.map(cat => (
        <div key={cat} className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CAT_COLORS[cat] }} />
          <span className="text-xs text-gray-500">{CAT_LABELS[cat]}</span>
        </div>
      ))}
    </div>
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
const PERIOD_X_INTERVAL = { 월: 5, 분기: 1, 년: 0 }

export default function Dashboard() {
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

  // Scatter grouping by category
  const scatterByCat = CATS.map(cat => ({
    cat,
    points: coinStats
      .filter(s => s.category === cat)
      .map(s => ({ x: s.volatility, y: s.return_1m, name: s.market.replace('KRW-', ''), category: cat })),
  }))

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
          <div className="text-sm font-semibold text-gray-700">카테고리별 누적 수익률</div>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p}
                onClick={() => setCumPeriod(p)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
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
        <div className="text-xs text-gray-400 mb-4">최근 5년 기준, 초기값 대비 누적 등락률 (%)</div>
        {cumLoading ? (
          <div className="h-[220px] flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cumulative} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                interval={PERIOD_X_INTERVAL[cumPeriod]}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v + '%'} />
              <Tooltip
                formatter={(v, name) => [v.toFixed(2) + '%', CAT_LABELS[name] || name]}
                contentStyle={{ fontSize: 12, borderColor: '#e5e7eb' }}
              />
              <Legend formatter={name => CAT_LABELS[name] || name} wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
              {CATS.map(cat => (
                <Line
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stroke={CAT_COLORS[cat]}
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
        <div className="text-sm font-semibold text-gray-700 mb-0.5">카테고리 상관관계</div>
        <div className="text-xs text-gray-400 mb-4">월별 수익률 기반 피어슨 상관계수 (-1 ~ +1)</div>
        <CorrHeatmap monthly={monthly} />
      </div>

      {/* Heatmap + Scatter */}
      <div className="grid grid-cols-12 gap-4">
        {/* Monthly heatmap */}
        <div className="col-span-5 bg-white border border-gray-200 rounded-lg p-5">
          <div className="text-sm font-semibold text-gray-700 mb-1">월별 카테고리 수익률</div>
          <div className="text-xs text-gray-400 mb-4">각 카테고리의 해당 월 평균 등락률 (%)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-3 w-20">카테고리</th>
                  {monthly.map(row => (
                    <th key={row.month} className="text-center text-xs text-gray-400 font-medium pb-2 px-1">
                      {row.month.slice(2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATS.map(cat => (
                  <tr key={cat}>
                    <td className="text-xs font-medium text-gray-600 py-1 pr-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CAT_COLORS[cat] }} />
                        {CAT_LABELS[cat]}
                      </div>
                    </td>
                    {monthly.map(row => (
                      <HeatmapCell key={row.month} value={row[cat]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Risk-Return scatter */}
        <div className="col-span-7 bg-white border border-gray-200 rounded-lg p-5">
          <div className="text-sm font-semibold text-gray-700 mb-1">리스크-수익 분포</div>
          <div className="text-xs text-gray-400 mb-3">X: 변동성 (30일 일간 수익률 표준편차), Y: 1개월 수익률</div>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 4, right: 20, bottom: 16, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="x"
                type="number"
                name="변동성"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickFormatter={v => v + '%'}
                label={{ value: '변동성 (%)', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#9ca3af' }}
              />
              <YAxis
                dataKey="y"
                type="number"
                name="수익률"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickFormatter={v => v + '%'}
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
                      <div className="text-gray-500">{CAT_LABELS[d.category]}</div>
                      <div className="text-gray-600 mt-1">변동성 {d.x}% / 수익률 {d.y > 0 ? '+' : ''}{d.y}%</div>
                    </div>
                  )
                }}
              />
              <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
              {scatterByCat.map(({ cat, points }) => (
                <Scatter
                  key={cat}
                  name={CAT_LABELS[cat]}
                  data={points}
                  fill={CAT_COLORS[cat]}
                  shape={<ScatterDot />}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
          <CatLegend />
        </div>
      </div>
    </div>
  )
}
