import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { useTickers, useMarketSummary } from '../hooks/useTickers'

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

function Sparkline({ data, change }) {
  const color = change === 'RISE' ? '#ef4444' : change === 'FALL' ? '#3b82f6' : '#9ca3af'
  return (
    <div style={{ width: 80, height: 32 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.map(v => ({ v }))}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function SummaryCard({ label, value, color = 'text-gray-800' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
      <div className="text-xs text-gray-400 mb-1.5">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

export default function CoinList() {
  const { tickers, loading: tLoading } = useTickers()
  const { summary, loading: sLoading } = useMarketSummary()
  const [search, setSearch] = useState('')

  if (tLoading || sLoading) return <div className="py-24 text-center text-sm text-gray-400">로딩 중...</div>

  const filtered = tickers.filter(t =>
    t.korean_name.includes(search) ||
    t.market.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      {/* 시장 요약 카드 */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard label="24h 총 거래대금" value={fmtVolume(summary.total_volume)} />
          <SummaryCard label="상승 종목" value={`${summary.up_count}개`} color="text-red-500" />
          <SummaryCard label="하락 종목" value={`${summary.down_count}개`} color="text-blue-500" />
          <SummaryCard label="BTC 도미넌스" value={`${summary.btc_dominance}%`} />
        </div>
      )}

      {/* 코인 테이블 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-700">KRW 마켓</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="종목 검색"
            className="border border-gray-200 rounded px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-[#093687] transition-colors"
          />
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
              <th className="px-4 py-2.5 text-left w-10 font-medium">#</th>
              <th className="px-4 py-2.5 text-left font-medium">종목명</th>
              <th className="px-4 py-2.5 text-right font-medium">현재가</th>
              <th className="px-4 py-2.5 text-right font-medium">24h 등락</th>
              <th className="px-4 py-2.5 text-right font-medium">거래대금(24h)</th>
              <th className="px-4 py-2.5 text-center font-medium">7일</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={t.market} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                <td className="px-4 py-3">
                  <Link to={`/coins/${t.market}`} className="flex items-center gap-2.5">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{t.korean_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{t.market.replace('KRW-', '')}</div>
                    </div>
                  </Link>
                </td>
                <td className={`px-4 py-3 text-right text-sm font-medium ${changeColor(t.change)}`}>
                  {t.trade_price.toLocaleString()}
                </td>
                <td className={`px-4 py-3 text-right text-sm font-medium ${changeColor(t.change)}`}>
                  {(t.change === 'RISE' ? '+' : '')}{(t.change_rate * 100).toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-600">
                  {fmtVolume(t.acc_trade_price_24h)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <Sparkline data={t.sparkline} change={t.change} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
