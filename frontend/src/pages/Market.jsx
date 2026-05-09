import { Link } from 'react-router-dom'
import {
  AreaChart, Area, ResponsiveContainer, Treemap,
  BarChart, Bar, XAxis, YAxis, LabelList, Cell,
} from 'recharts'
import { useTickers } from '../hooks/useTickers'

const FEATURED = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL']

const VOL_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']

function fmtRate(r) {
  return (r > 0 ? '+' : '') + (r * 100).toFixed(2) + '%'
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

function MiniCard({ ticker }) {
  const isRise = ticker.change === 'RISE'
  const color = isRise ? '#ef4444' : '#3b82f6'
  const data = ticker.sparkline.map(v => ({ v }))

  return (
    <Link to={`/coins/${ticker.market}`} className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-xs text-gray-400">{ticker.market.replace('KRW-', '')}</div>
          <div className="text-sm font-semibold text-gray-800">{ticker.korean_name}</div>
        </div>
        <div className="text-right">
          <div className={`text-base font-bold ${changeColor(ticker.change)}`}>
            {ticker.trade_price.toLocaleString()}
          </div>
          <div className={`text-xs mt-0.5 ${changeColor(ticker.change)}`}>
            {fmtRate(ticker.change_rate)}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={48}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`g-${ticker.market}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#g-${ticker.market})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Link>
  )
}

function RankTable({ title, rows, color }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className={`px-4 py-3 border-b border-gray-100 text-sm font-semibold ${color}`}>{title}</div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-400">
            <th className="px-4 py-2 text-left font-medium">종목</th>
            <th className="px-4 py-2 text-right font-medium">현재가</th>
            <th className="px-4 py-2 text-right font-medium">등락률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.market} className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer">
              <td className="px-4 py-2.5">
                <Link to={`/coins/${t.market}`} className="flex flex-col">
                  <span className="text-sm font-medium text-gray-800">{t.korean_name}</span>
                  <span className="text-xs text-gray-400 mt-0.5">{t.market.replace('KRW-', '')}</span>
                </Link>
              </td>
              <td className={`px-4 py-2.5 text-right text-sm font-medium ${changeColor(t.change)}`}>
                {t.trade_price.toLocaleString()}
              </td>
              <td className={`px-4 py-2.5 text-right text-sm font-medium ${changeColor(t.change)}`}>
                {fmtRate(t.change_rate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VolumeChart({ tickers }) {
  const top5 = [...tickers]
    .sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h)
    .slice(0, 5)
  const data = top5.map(t => ({
    name: t.market.replace('KRW-', ''),
    value: t.acc_trade_price_24h,
  }))

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="text-sm font-semibold text-gray-700 mb-0.5">거래대금 TOP 5</div>
      <div className="text-xs text-gray-400 mb-4">24h 기준</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} width={32} axisLine={false} tickLine={false} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={18} isAnimationActive={false}>
            {data.map((_, i) => <Cell key={i} fill={VOL_COLORS[i]} />)}
            <LabelList dataKey="value" position="right" formatter={fmtVolume} style={{ fontSize: 11, fill: '#6b7280' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function W52Badges({ tickers }) {
  const highs = tickers.filter(t => t.is_52w_high)
  const lows  = tickers.filter(t => t.is_52w_low)

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-5 py-3.5 flex items-center gap-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-red-500 flex-shrink-0 w-20">52주 신고가</span>
        {highs.length === 0
          ? <span className="text-xs text-gray-400">없음</span>
          : highs.map(t => (
            <Link key={t.market} to={`/coins/${t.market}`}>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                {t.market.replace('KRW-', '')}
              </span>
            </Link>
          ))
        }
      </div>
      <div className="w-px h-5 bg-gray-200 flex-shrink-0" />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-blue-500 flex-shrink-0 w-20">52주 신저가</span>
        {lows.length === 0
          ? <span className="text-xs text-gray-400">없음</span>
          : lows.map(t => (
            <Link key={t.market} to={`/coins/${t.market}`}>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                {t.market.replace('KRW-', '')}
              </span>
            </Link>
          ))
        }
      </div>
    </div>
  )
}

function TreemapCell({ x, y, width, height, name, change_rate }) {
  if (!width || !height) return null
  const abs = Math.abs(change_rate)
  const opacity = Math.min(0.9, 0.25 + abs * 6)
  const fill = change_rate >= 0
    ? `rgba(239,68,68,${opacity})`
    : `rgba(59,130,246,${opacity})`
  const sign = change_rate > 0 ? '+' : ''

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={1} />
      {width > 55 && height > 38 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={12} fontWeight="600">
            {name}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="#fff" fontSize={11}>
            {sign}{(change_rate * 100).toFixed(2)}%
          </text>
        </>
      )}
    </g>
  )
}

export default function Market() {
  const { tickers, loading } = useTickers()

  if (loading) return (
    <div className="py-24 flex justify-center">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  const sorted = [...tickers].sort((a, b) => b.change_rate - a.change_rate)
  const featured = FEATURED.map(m => tickers.find(t => t.market === m)).filter(Boolean)
  const treemapData = tickers.map(t => ({
    name: t.market.replace('KRW-', ''),
    size: t.acc_trade_price_24h,
    change_rate: t.change_rate,
  }))

  return (
    <div className="space-y-4">
      {/* 주요 종목 카드 */}
      <div className="grid grid-cols-4 gap-4">
        {featured.map(t => <MiniCard key={t.market} ticker={t} />)}
      </div>

      {/* 52주 신고가/신저가 배지 */}
      <W52Badges tickers={tickers} />

      {/* 상승률 | 하락률 | 거래대금 TOP5 */}
      <div className="grid grid-cols-3 gap-4">
        <RankTable
          title="상승률 상위"
          rows={sorted.slice(0, 8)}
          color="text-red-500"
        />
        <RankTable
          title="하락률 상위"
          rows={[...sorted].reverse().slice(0, 8)}
          color="text-blue-500"
        />
        <VolumeChart tickers={tickers} />
      </div>

      {/* 시장 현황 트리맵 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">시장 현황</div>
        <div className="p-2">
          <ResponsiveContainer width="100%" height={320}>
            <Treemap data={treemapData} dataKey="size" content={<TreemapCell />} isAnimationActive={false} />
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
