import { Link } from 'react-router-dom'
import { AreaChart, Area, ResponsiveContainer, Treemap } from 'recharts'
import { useTickers } from '../hooks/useTickers'

const FEATURED = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL']

function fmtRate(r) {
  return (r > 0 ? '+' : '') + (r * 100).toFixed(2) + '%'
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
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#g-${ticker.market})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Link>
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

  if (loading) return <div className="py-24 text-center text-sm text-gray-400">로딩 중...</div>

  const featured = FEATURED.map(m => tickers.find(t => t.market === m)).filter(Boolean)
  const sorted = [...tickers].sort((a, b) => b.change_rate - a.change_rate)
  const treemapData = tickers.map(t => ({
    name: t.market.replace('KRW-', ''),
    size: t.acc_trade_price_24h,
    change_rate: t.change_rate,
  }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {featured.map(t => <MiniCard key={t.market} ticker={t} />)}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">상승률 상위</div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-400">
                <th className="px-4 py-2 text-left font-medium">종목</th>
                <th className="px-4 py-2 text-right font-medium">현재가</th>
                <th className="px-4 py-2 text-right font-medium">등락률</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 10).map(t => (
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

        <div className="col-span-7 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">시장 현황</div>
          <div className="p-2">
            <ResponsiveContainer width="100%" height={390}>
              <Treemap data={treemapData} dataKey="size" content={<TreemapCell />} />
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
