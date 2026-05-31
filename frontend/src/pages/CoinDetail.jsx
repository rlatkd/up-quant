import { useState, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts'
import { useTicker, useTickers, useOrderbook, useTrades } from '../hooks/useTickers'
import { useCandles } from '../hooks/useCandles'
import { useCorrelation, useCoinStats } from '../hooks/useAnalysis'
import { useGarch } from '../hooks/useQuant'

// ── 기술적 지표 계산 ──────────────────────────────────────
function calcMA(closes, period) {
  return closes.map((_, i) =>
    i < period - 1 ? null : closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  )
}

function calcBollinger(closes, period = 20, mult = 2) {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    const slice = closes.slice(i - period + 1, i + 1)
    const ma  = slice.reduce((a, b) => a + b, 0) / period
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - ma) ** 2, 0) / period)
    return { upper: ma + mult * std, lower: ma - mult * std }
  })
}

function calcRSI(closes, period = 14) {
  return closes.map((_, i) => {
    if (i < period) return null
    const slice = closes.slice(i - period, i)
    const gains  = slice.map((v, j) => j === 0 ? 0 : Math.max(0, v - slice[j - 1]))
    const losses = slice.map((v, j) => j === 0 ? 0 : Math.max(0, slice[j - 1] - v))
    const ag = gains.reduce((a, b) => a + b, 0) / period
    const al = losses.reduce((a, b) => a + b, 0) / period
    return al === 0 ? 100 : parseFloat((100 - 100 / (1 + ag / al)).toFixed(2))
  })
}

// ── 상관관계 색상 ──
function corrColor(v) {
  if (v >= 0.7)  return 'text-red-600 bg-red-50'
  if (v >= 0.3)  return 'text-red-400 bg-red-50/50'
  if (v >= -0.3) return 'text-gray-500 bg-gray-50'
  if (v >= -0.7) return 'text-blue-400 bg-blue-50/50'
  return 'text-blue-600 bg-blue-50'
}

// ── 차트 컴포넌트 ──────────────────────────────────────────
function CandlestickChart({ candles, indicators }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const seriesRef    = useRef({})

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      autoSize: true,  // 컨테이너 크기에 맞춰 자동 리사이즈 (부모 flex 높이를 채움)
      attributionLogo: false,
      layout: { background: { color: '#ffffff' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
      rightPriceScale: { borderColor: '#e5e7eb' },
      timeScale: { borderColor: '#e5e7eb', timeVisible: true },
      crosshair: { mode: 1 },
    })
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444', downColor: '#3b82f6',
      borderUpColor: '#ef4444', borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444', wickDownColor: '#3b82f6',
    })
    seriesRef.current = { candle, chart }
    chartRef.current  = chart

    return () => { chart.remove() }
  }, [])

  useEffect(() => {
    const { candle, chart } = seriesRef.current
    if (!candle || !candles.length) return
    const data = candles.map(c => ({
      time: Math.floor(c.timestamp / 1000),
      open: c.open, high: c.high, low: c.low, close: c.close,
    }))
    candle.setData(data)
    chart.timeScale().fitContent()

    // MA 시리즈 제거 후 재생성
    ;['ma20', 'ma60', 'bbUpper', 'bbLower'].forEach(k => {
      if (seriesRef.current[k]) { chart.removeSeries(seriesRef.current[k]); seriesRef.current[k] = null }
    })

    const closes = candles.map(c => c.close)
    const times  = data.map(d => d.time)

    if (indicators.ma) {
      const ma20 = calcMA(closes, 20)
      const ma60 = calcMA(closes, 60)
      const s20 = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      const s60 = chart.addSeries(LineSeries, { color: '#6366f1', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s20.setData(times.map((t, i) => ma20[i] !== null ? { time: t, value: ma20[i] } : null).filter(Boolean))
      s60.setData(times.map((t, i) => ma60[i] !== null ? { time: t, value: ma60[i] } : null).filter(Boolean))
      seriesRef.current.ma20 = s20
      seriesRef.current.ma60 = s60
    }

    if (indicators.bollinger) {
      const bb = calcBollinger(closes)
      const su = chart.addSeries(LineSeries, { color: '#10b981', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      const sl = chart.addSeries(LineSeries, { color: '#10b981', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      su.setData(times.map((t, i) => bb[i] ? { time: t, value: bb[i].upper } : null).filter(Boolean))
      sl.setData(times.map((t, i) => bb[i] ? { time: t, value: bb[i].lower } : null).filter(Boolean))
      seriesRef.current.bbUpper = su
      seriesRef.current.bbLower = sl
    }
  }, [candles, indicators])

  return <div ref={containerRef} className="w-full h-full" />
}

function RSIChart({ candles }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      attributionLogo: false,
      layout: { background: { color: '#ffffff' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
      rightPriceScale: { borderColor: '#e5e7eb', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#e5e7eb', timeVisible: true },
    })
    chartRef.current = chart
    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.remove() }
  }, [])

  useEffect(() => {
    if (!chartRef.current || !candles.length) return
    const chart = chartRef.current
    chart.getSeries().forEach(s => chart.removeSeries(s))

    const closes = candles.map(c => c.close)
    const times  = candles.map(c => Math.floor(c.timestamp / 1000))
    const rsi    = calcRSI(closes)

    const rsiSeries = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true })
    rsiSeries.setData(times.map((t, i) => rsi[i] !== null ? { time: t, value: rsi[i] } : null).filter(Boolean))

    const ob = chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
    const os = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
    const validTimes = times.filter((_, i) => rsi[i] !== null)
    if (validTimes.length) {
      ob.setData(validTimes.map(t => ({ time: t, value: 70 })))
      os.setData(validTimes.map(t => ({ time: t, value: 30 })))
    }
    chart.timeScale().fitContent()
  }, [candles])

  return <div ref={containerRef} style={{ height: 120 }} />
}

// ── 상수 ──────────────────────────────────────────────────
const INTERVALS = [
  { label: '1분',   api: 'minutes/1',   count: 100 },
  { label: '3분',   api: 'minutes/3',   count: 100 },
  { label: '5분',   api: 'minutes/5',   count: 100 },
  { label: '15분',  api: 'minutes/15',  count: 100 },
  { label: '30분',  api: 'minutes/30',  count: 100 },
  { label: '1시간', api: 'minutes/60',  count: 100 },
  { label: '4시간', api: 'minutes/240', count: 100 },
  { label: '일',    api: 'days',        count: 120 },
  { label: '주',    api: 'weeks',       count: 100 },
  { label: '월',    api: 'months',      count: 60 },
]

function fmtVolume(v) {
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '억'
  return v.toLocaleString()
}

function fmtTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const pctSigned = (v) => (v > 0 ? '+' : '') + (v ?? 0).toFixed(2) + '%'

// 주요 지표 한 칸
function Metric({ label, value, color = 'text-gray-800', hint }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400 mb-0.5">{label}</div>
      <div className={`text-base font-bold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  )
}

// ── 본문 (재사용 가능 컴포넌트) ────────────────────────────
// CoinList(master-detail)에서도 이 컴포넌트를 그대로 우측 메인에 끼워 쓴다.
// market을 prop으로 받아 라우터 의존을 없앴고, 단독 라우트는 default export wrapper가 useParams로 넘긴다.
export function CoinDetailView({ market }) {
  const [intervalIdx, setIntervalIdx] = useState(7)
  const [indicators, setIndicators]   = useState({ ma: false, bollinger: false, rsi: false })

  const { ticker, loading }   = useTicker(market)
  const { orderbook }         = useOrderbook(market)
  const { trades }            = useTrades(market)
  const { candles }           = useCandles(market, INTERVALS[intervalIdx].api, INTERVALS[intervalIdx].count)
  const { data: corrData }    = useCorrelation(market)
  // 추가 지표용 — 전체 티커(시장 점유율), 코인 통계(변동성·수익률), GARCH(리스크)
  const { tickers }           = useTickers()
  const { data: coinStats }   = useCoinStats()
  const { data: garch }       = useGarch(market)

  if (loading || !ticker) return (
    <div className="py-24 flex justify-center">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )

  const isRise = ticker.change === 'RISE'
  const isFall = ticker.change === 'FALL'
  const priceColor = isRise ? 'text-red-500' : isFall ? 'text-blue-500' : 'text-gray-700'

  // 추가 지표
  const stat = coinStats.find(s => s.market === market)
  const totalVol = tickers.reduce((s, t) => s + t.acc_trade_price_24h, 0)
  const share = totalVol ? (ticker.acc_trade_price_24h / totalVol) * 100 : 0
  const w52span = ticker.w52_high - ticker.w52_low
  const w52pos = w52span > 0 ? Math.max(0, Math.min(100, (ticker.trade_price - ticker.w52_low) / w52span * 100)) : 0

  function toggleIndicator(key) {
    setIndicators(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="space-y-4">
      {/* 상단 가격 정보 */}
      <div className="bg-white border border-gray-200 rounded-md px-6 py-4">
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
              ['고가',       ticker.high_price.toLocaleString(),        'text-red-500'],
              ['저가',       ticker.low_price.toLocaleString(),         'text-blue-500'],
              ['전일종가',   ticker.prev_closing_price.toLocaleString(), 'text-gray-700'],
              ['거래대금(24h)', fmtVolume(ticker.acc_trade_price_24h),  'text-gray-700'],
            ].map(([label, value, color]) => (
              <div key={label}>
                <div className="text-xs text-gray-400 mb-1">{label}</div>
                <div className={`font-medium ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 주요 지표 + 52주 위치 — 변동성·수익률·시장점유 + GARCH 리스크(퀀트 통합) */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 bg-white border border-gray-200 rounded-md p-4">
          <div className="text-sm font-semibold text-gray-700 mb-3">주요 지표</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Metric label="30일 변동성" value={stat ? stat.volatility.toFixed(2) + '%' : '—'} hint="일간 표준편차" />
            <Metric label="1개월 수익률" value={stat ? pctSigned(stat.return_1m) : '—'}
              color={stat ? (stat.return_1m >= 0 ? 'text-red-500' : 'text-blue-500') : 'text-gray-800'} />
            <Metric label="시장 점유율" value={share.toFixed(2) + '%'} hint="24h 거래대금 비중" />
            <Metric label="GARCH 연변동성" value={garch.current_vol_annual ? garch.current_vol_annual.toFixed(1) + '%' : '—'}
              hint={garch.persistence ? `지속성 ${garch.persistence.toFixed(2)}` : '예측 중'} />
            <Metric label="1일 95% VaR" value={garch.var_95 ? '-' + garch.var_95.toFixed(2) + '%' : '—'}
              color="text-blue-500" hint="예상 최대손실" />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 bg-white border border-gray-200 rounded-md p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-gray-700">52주 위치</div>
            {ticker.is_52w_high && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">오늘 신고가</span>}
            {ticker.is_52w_low && <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">오늘 신저가</span>}
          </div>
          <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(to right, #bfdbfe, #f3f4f6, #fecaca)' }}>
            <div className="absolute top-1/2 w-3 h-3 rounded-full bg-brand-500 border-2 border-white shadow"
              style={{ left: `${w52pos}%`, transform: 'translate(-50%, -50%)' }} />
          </div>
          <div className="flex justify-between text-[11px] mt-2">
            <span className="text-blue-500">{ticker.w52_low.toLocaleString()}</span>
            <span className="text-gray-400">현재 {w52pos.toFixed(0)}%</span>
            <span className="text-red-500">{ticker.w52_high.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 차트 + 호가창 (카드 높이를 맞추고, 호가창은 내부 스크롤) */}
      <div className="grid grid-cols-12 gap-4 h-[560px]">
        <div className="col-span-9 bg-white border border-gray-200 rounded-md overflow-hidden flex flex-col">
          {/* 시간 탭 + 지표 토글 */}
          <div className="flex items-center justify-between border-b border-gray-100 px-2 shrink-0">
            <div className="flex">
              {INTERVALS.map((iv, i) => (
                <button
                  key={iv.label}
                  onClick={() => setIntervalIdx(i)}
                  className={`px-3 py-2.5 text-xs font-medium border-b-2 -mb-px cursor-pointer transition-colors ${
                    intervalIdx === i
                      ? 'border-[#093687] text-[#093687]'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {iv.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 pr-2">
              {[
                { key: 'ma',        label: 'MA',        color: 'indigo' },
                { key: 'bollinger', label: 'Bollinger', color: 'emerald' },
                { key: 'rsi',       label: 'RSI',       color: 'violet' },
              ].map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => toggleIndicator(key)}
                  className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${
                    indicators[key]
                      ? `bg-${color}-500 text-white`
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  style={indicators[key] ? { backgroundColor: { indigo: '#6366f1', emerald: '#10b981', violet: '#8b5cf6' }[color] } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 pb-3 pt-2 flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0">
              <CandlestickChart candles={candles} indicators={indicators} />
            </div>
            {indicators.rsi && (
              <div className="mt-1 border-t border-gray-100 pt-1 shrink-0">
                <div className="text-xs text-gray-400 mb-1 px-1">RSI(14)</div>
                <RSIChart candles={candles} />
              </div>
            )}
          </div>
        </div>

        {/* 호가창 (차트와 같은 높이, 현재가 중심 스크롤) */}
        <div className="col-span-3 bg-white border border-gray-200 rounded-md overflow-hidden flex flex-col">
          <div className="px-3 py-2.5 border-b border-gray-100 text-xs font-semibold text-gray-600 shrink-0">호가</div>
          {orderbook ? (
            <div className="text-xs flex-1 min-h-0 overflow-y-auto">
              {[...orderbook.asks].reverse().map((ask, i) => (
                <div key={i} className="relative flex items-center px-3 py-1 hover:bg-blue-50">
                  <div className="absolute right-0 top-0 bottom-0 bg-blue-50" style={{ width: `${Math.min(75, ask.size * 25)}%` }} />
                  <span className="relative z-10 flex-1 text-blue-500 font-medium">{ask.price.toLocaleString()}</span>
                  <span className="relative z-10 text-gray-400">{ask.size.toFixed(4)}</span>
                </div>
              ))}
              <div className={`flex items-center justify-center py-1.5 font-bold text-sm border-y border-gray-200 bg-gray-50 ${priceColor}`}>
                {ticker.trade_price.toLocaleString()}
              </div>
              {orderbook.bids.map((bid, i) => (
                <div key={i} className="relative flex items-center px-3 py-1 hover:bg-red-50">
                  <div className="absolute right-0 top-0 bottom-0 bg-red-50" style={{ width: `${Math.min(75, bid.size * 25)}%` }} />
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

      {/* 체결내역 (종목 기본정보는 상단 가격 헤더와 중복되어 제거) */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">체결 내역</div>
        <div className="max-h-96 overflow-y-auto">
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
      </div>

      {/* 상관관계 분석 */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-sm font-semibold text-gray-700">타 종목 상관관계</div>
          <Link to="/analysis#network" className="text-xs text-brand-600 hover:underline">전체 상관 네트워크 →</Link>
        </div>
        <div className="text-xs text-gray-400 mb-4">60일 일봉 종가 기준 피어슨 상관계수</div>
        <div className="grid grid-cols-7 gap-2">
          {corrData.slice(0, 14).map(item => (
            <div key={item.market} className={`rounded-md px-3 py-2.5 text-center ${corrColor(item.correlation)}`}>
              <div className="text-xs font-semibold">{item.market.replace('KRW-', '')}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.korean_name}</div>
              <div className="text-sm font-bold mt-1">{item.correlation.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// 단독 라우트(`/coins/:market`)용 wrapper — URL의 market을 본문 컴포넌트에 그대로 넘긴다.
export default function CoinDetail() {
  const { market } = useParams()
  return <CoinDetailView market={market} />
}
