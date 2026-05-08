import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { createChart, CandlestickSeries } from 'lightweight-charts'
import { useTicker, useOrderbook, useTrades } from '../hooks/useTickers'
import { useCandles } from '../hooks/useCandles'

function CandlestickChart({ candles }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      attributionLogo: false,
      layout: { background: { color: '#ffffff' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
      rightPriceScale: { borderColor: '#e5e7eb' },
      timeScale: { borderColor: '#e5e7eb', timeVisible: true },
      crosshair: { mode: 1 },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
    })

    chartRef.current = chart
    seriesRef.current = series

    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
    }
  }, [])

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return
    const data = candles.map(c => ({
      time: Math.floor(c.timestamp / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))
    seriesRef.current.setData(data)
    chartRef.current.timeScale().fitContent()
  }, [candles])

  return <div ref={containerRef} style={{ height: 320 }} />
}

const INTERVALS = [
  { label: '1분',  api: 'minutes', count: 60 },
  { label: '3분',  api: 'minutes', count: 60 },
  { label: '5분',  api: 'minutes', count: 60 },
  { label: '15분', api: 'minutes', count: 60 },
  { label: '30분', api: 'minutes', count: 60 },
  { label: '1시간', api: 'minutes', count: 60 },
  { label: '4시간', api: 'minutes', count: 60 },
  { label: '일',   api: 'days',    count: 60 },
  { label: '주',   api: 'weeks',   count: 52 },
  { label: '월',   api: 'days',    count: 90 },
]

function fmtVolume(v) {
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '억'
  return v.toLocaleString()
}

function fmtTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function CoinDetail() {
  const { market } = useParams()
  const [intervalIdx, setIntervalIdx] = useState(7) // 기본: 일봉

  const { ticker, loading } = useTicker(market)
  const { orderbook } = useOrderbook(market)
  const { trades } = useTrades(market)
  const { candles } = useCandles(market, INTERVALS[intervalIdx].api, INTERVALS[intervalIdx].count)

  if (loading || !ticker) return <div className="py-24 text-center text-sm text-gray-400">로딩 중...</div>

  const isRise = ticker.change === 'RISE'
  const isFall = ticker.change === 'FALL'
  const priceColor = isRise ? 'text-red-500' : isFall ? 'text-blue-500' : 'text-gray-700'

  return (
    <div className="space-y-4">
      {/* 상단 가격 정보 */}
      <div className="bg-white border border-gray-200 rounded-lg px-6 py-4">
        <div className="flex items-center gap-10">
          <div className="min-w-[120px]">
            <div className="text-xs text-gray-400 mb-0.5">{market}</div>
            <div className="text-base font-semibold text-gray-800">{ticker.korean_name}</div>
          </div>
          <div>
            <div className={`text-3xl font-bold tracking-tight ${priceColor}`}>
              {ticker.trade_price.toLocaleString()}
              <span className="text-sm font-normal ml-1 text-gray-400">KRW</span>
            </div>
            <div className={`text-sm mt-1 ${priceColor}`}>
              {isRise ? '▲' : isFall ? '▼' : ''}{' '}
              {ticker.change_price.toLocaleString()} ({isRise ? '+' : ''}{(ticker.change_rate * 100).toFixed(2)}%)
            </div>
          </div>
          <div className="flex gap-7 ml-4 text-sm border-l border-gray-100 pl-8">
            {[
              ['고가', ticker.high_price.toLocaleString(), 'text-red-500'],
              ['저가', ticker.low_price.toLocaleString(), 'text-blue-500'],
              ['전일종가', ticker.prev_closing_price.toLocaleString(), 'text-gray-700'],
              ['거래대금(24h)', fmtVolume(ticker.acc_trade_price_24h), 'text-gray-700'],
            ].map(([label, value, color]) => (
              <div key={label}>
                <div className="text-xs text-gray-400 mb-1">{label}</div>
                <div className={`font-medium ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 차트 + 호가창 */}
      <div className="grid grid-cols-12 gap-4">
        {/* 차트 */}
        <div className="col-span-9 bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* 시간 탭 */}
          <div className="flex border-b border-gray-100 px-2">
            {INTERVALS.map((iv, i) => (
              <button
                key={iv.label}
                onClick={() => setIntervalIdx(i)}
                className={`px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  intervalIdx === i
                    ? 'border-[#093687] text-[#093687]'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>
          <div className="px-4 pb-4 pt-2">
            <CandlestickChart candles={candles} />
          </div>
        </div>

        {/* 호가창 */}
        <div className="col-span-3 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 text-xs font-semibold text-gray-600">호가</div>
          {orderbook ? (
            <div className="text-xs">
              {/* 매도 (asks) — 높은 가격부터 역순 표시 */}
              {[...orderbook.asks].reverse().map((ask, i) => (
                <div key={i} className="relative flex items-center px-3 py-1 hover:bg-blue-50">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-blue-50"
                    style={{ width: `${Math.min(75, ask.size * 25)}%` }}
                  />
                  <span className="relative z-10 flex-1 text-blue-500 font-medium">{ask.price.toLocaleString()}</span>
                  <span className="relative z-10 text-gray-400">{ask.size.toFixed(4)}</span>
                </div>
              ))}
              {/* 현재가 구분선 */}
              <div className={`flex items-center justify-center py-1.5 font-bold text-sm border-y border-gray-200 bg-gray-50 ${priceColor}`}>
                {ticker.trade_price.toLocaleString()}
              </div>
              {/* 매수 (bids) */}
              {orderbook.bids.map((bid, i) => (
                <div key={i} className="relative flex items-center px-3 py-1 hover:bg-red-50">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-red-50"
                    style={{ width: `${Math.min(75, bid.size * 25)}%` }}
                  />
                  <span className="relative z-10 flex-1 text-red-500 font-medium">{bid.price.toLocaleString()}</span>
                  <span className="relative z-10 text-gray-400">{bid.size.toFixed(4)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-gray-400">로딩 중...</div>
          )}
        </div>
      </div>

      {/* 하단: 체결내역 + 종목정보 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 체결내역 */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">체결 내역</div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
                <th className="px-3 py-2 text-left font-medium">시간</th>
                <th className="px-3 py-2 text-right font-medium">가격</th>
                <th className="px-3 py-2 text-right font-medium">수량</th>
                <th className="px-3 py-2 text-center font-medium">구분</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((tr, i) => (
                <tr key={i} className="border-t border-gray-50 text-xs">
                  <td className="px-3 py-1.5 text-gray-400">{fmtTime(tr.timestamp)}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${tr.side === 'BID' ? 'text-red-500' : 'text-blue-500'}`}>
                    {tr.price.toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{tr.volume.toFixed(4)}</td>
                  <td className={`px-3 py-1.5 text-center font-medium ${tr.side === 'BID' ? 'text-red-500' : 'text-blue-500'}`}>
                    {tr.side === 'BID' ? '매수' : '매도'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 종목 정보 */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">종목 정보</div>
          <div className="divide-y divide-gray-50">
            {[
              ['마켓', ticker.market],
              ['종목명', ticker.korean_name],
              ['현재가', ticker.trade_price.toLocaleString() + ' KRW'],
              ['전일 종가', ticker.prev_closing_price.toLocaleString() + ' KRW'],
              ['당일 고가', ticker.high_price.toLocaleString() + ' KRW'],
              ['당일 저가', ticker.low_price.toLocaleString() + ' KRW'],
              ['거래대금(24h)', fmtVolume(ticker.acc_trade_price_24h) + ' KRW'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-400">{k}</span>
                <span className="text-gray-800 font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
