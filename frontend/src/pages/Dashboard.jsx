import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, ZAxis, ReferenceLine, ResponsiveContainer,
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

export default function Dashboard() {
  const { tickers, loading: tickersLoading } = useTickers()
  const { data: monthly, loading: monthlyLoading } = useCategoryMonthly()
  const { data: cumulative, loading: cumLoading } = useCategoryCumulative()
  const { data: coinStats, loading: statsLoading } = useCoinStats()

  if (tickersLoading || monthlyLoading || cumLoading || statsLoading) {
    return <div className="py-24 text-center text-sm text-gray-400">로딩 중...</div>
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

      {/* Cumulative returns */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="text-sm font-semibold text-gray-700 mb-1">카테고리별 누적 수익률</div>
        <div className="text-xs text-gray-400 mb-4">최근 6개월 기준, 초기값 대비 누적 등락률 (%)</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={cumulative} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
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
