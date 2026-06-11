import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts'
import { useTickers, useOrderbook, useTrades } from '../hooks/useTickers'
import { useCandles } from '../hooks/useCandles'
import { useCorrelation, useCoinStats } from '../hooks/useAnalysis'
import { useGarch } from '../hooks/useQuant'
import { useSignals } from '../hooks/useSignals'
import { useMarketStream } from '../hooks/useMarketStream'
import { useLivePrice, usePulse, useLiveTickers } from '../contexts/useRealtime'
import PageLoading from '../components/ui/PageLoading'
import Spinner from '../components/ui/Spinner'
import type { CandleItem } from '../types'

// ── 기술적 지표 계산 ──────────────────────────────────────
function calcMA(closes: number[], period: number) {
  return closes.map((_, i) =>
    i < period - 1 ? null : closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  )
}

function calcBollinger(closes: number[], period = 20, mult = 2) {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    const slice = closes.slice(i - period + 1, i + 1)
    const ma  = slice.reduce((a, b) => a + b, 0) / period
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - ma) ** 2, 0) / period)
    return { upper: ma + mult * std, lower: ma - mult * std }
  })
}

// Wilder RSI(표준) — 첫 period개 변화의 단순평균으로 시드 후 지수평활(α=1/period). 백엔드와 동일 정의.
// (과거엔 매 봉 윈도우 단순평균이라 업비트/TradingView 값과 어긋났음)
function calcRSI(closes: number[], period = 14) {
  const n = closes.length
  const out = new Array(n).fill(null)
  if (n <= period) return out
  const gains: number[] = [], losses: number[] = []
  for (let i = 1; i < n; i++) {
    const d = closes[i] - closes[i - 1]
    gains.push(d > 0 ? d : 0)
    losses.push(d < 0 ? -d : 0)
  }
  let ag = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let al = losses.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period] = al === 0 ? 100 : parseFloat((100 - 100 / (1 + ag / al)).toFixed(2))
  for (let i = period + 1; i < n; i++) {
    ag = (ag * (period - 1) + gains[i - 1]) / period
    al = (al * (period - 1) + losses[i - 1]) / period
    out[i] = al === 0 ? 100 : parseFloat((100 - 100 / (1 + ag / al)).toFixed(2))
  }
  return out
}

// 누적 VWAP(거래량가중평균가) — 표시 구간 시작부터 누적. typical=(고+저+종)/3.
// 현재가가 VWAP 위면 그 구간 평균 매수단가보다 비싸게 거래되는 중(매수 우위).
function calcVWAP(candles: CandleItem[]) {
  let pv = 0, vv = 0
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3
    pv += typical * c.volume
    vv += c.volume
    return vv > 0 ? pv / vv : null
  })
}

// 가격대별 거래량(Volume Profile) — 표시 구간 가격범위를 bins칸으로 나눠 각 캔들 거래량을
// (고+저+종)/3 가격대 칸에 누적. 어느 가격대에 거래가 몰렸는지(지지/저항 후보)를 보여준다.
function calcVolumeProfile(candles: CandleItem[], bins = 24) {
  if (!candles.length) return { rows: [], lo: 0, hi: 0 }
  const prices = candles.flatMap((c) => [c.high, c.low])
  const lo = Math.min(...prices), hi = Math.max(...prices)
  const span = hi - lo || 1
  const buckets = Array.from({ length: bins }, () => 0)
  candles.forEach((c) => {
    const typical = (c.high + c.low + c.close) / 3
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((typical - lo) / span * bins)))
    buckets[idx] += c.volume
  })
  const maxV = Math.max(...buckets, 1e-9)
  // 위(고가)→아래(저가) 순서로, 각 칸의 가격 중앙값과 상대 거래량(0~1)
  const rows = buckets.map((v, i) => ({
    price: lo + (i + 0.5) / bins * span,
    vol: v,
    ratio: v / maxV,
  })).reverse()
  return { rows, lo, hi }
}

// ── 상관관계 색상 ──
function corrColor(v: number) {
  if (v >= 0.7)  return 'text-red-600 bg-red-50'
  if (v >= 0.3)  return 'text-red-400 bg-red-50/50'
  if (v >= -0.3) return 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#141b29]'
  if (v >= -0.7) return 'text-blue-400 bg-blue-50/50'
  return 'text-blue-600 bg-blue-50'
}

// 가격대별 거래량 패널 — 차트 우측에 수평 막대(위=고가). 차트 가격축과 근사 정렬(scaleMargins 미보정).
function VolumeProfilePanel({ candles }: { candles: CandleItem[] }) {
  const { rows } = calcVolumeProfile(candles)
  if (!rows.length) return null
  const slotH = 100 / rows.length
  return (
    <div className="w-16 h-full border-l border-gray-100 dark:border-[#232d40] shrink-0 relative">
      <svg width="100%" height="100%" preserveAspectRatio="none" className="block">
        {rows.map((r, i) => (
          <rect key={i} x="0" y={`${i * slotH}%`}
            width={`${Math.max(2, r.ratio * 100)}%`} height={`${slotH * 0.8}%`}
            fill="#64748b" opacity={0.35} />
        ))}
      </svg>
      <span className="absolute top-0.5 right-1 text-[9px] text-gray-400 dark:text-gray-500">거래량대</span>
    </div>
  )
}

// lightweight-charts는 JS로 색을 받으므로 다크모드 시 테마를 읽어 배경/격자색을 지정한다.
// (마운트 시점 테마 — 토글 직후 즉시 반영은 안 되고 종목/인터벌 변경·새로고침 시 반영)
function chartTheme() {
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  return dark
    ? { bg: '#1a2234', text: '#8b96a8', grid: '#252f43', border: '#2c3850' }
    : { bg: '#ffffff', text: '#9ca3af', grid: '#f3f4f6', border: '#e5e7eb' }
}

// 인터벌의 한 봉(버킷) 길이(초). months는 캘린더 기반이라 새 봉 형성은 생략(라이브 종가만 갱신).
function bucketSeconds(intervalApi: string): number | null {
  if (intervalApi?.startsWith('minutes/')) return parseInt(intervalApi.split('/')[1], 10) * 60
  if (intervalApi === 'days') return 86400
  if (intervalApi === 'weeks') return 604800
  return null
}

// ── 차트 컴포넌트 ──────────────────────────────────────────
function CandlestickChart({ candles, indicators, livePrice, intervalApi }: { candles: CandleItem[]; indicators: Record<string, boolean>; livePrice: number | null; intervalApi: string }) {
  const containerRef = useRef<any>(null)
  const chartRef     = useRef<any>(null)
  const seriesRef    = useRef<any>({})
  const liveBarRef   = useRef<any>(null)   // 형성 중인 라이브 봉(REST 마지막 봉 이후 버킷)

  useEffect(() => {
    if (!containerRef.current) return
    const th = chartTheme()
    const chart = createChart(containerRef.current, {
      autoSize: true,  // 컨테이너 크기에 맞춰 자동 리사이즈 (부모 flex 높이를 채움)
      // attributionLogo는 LayoutOptions 소속 — layout 안에 둬야 적용됨(최상위에 두면 무시).
      layout: { background: { color: th.bg }, textColor: th.text, attributionLogo: false },
      grid: { vertLines: { color: th.grid }, horzLines: { color: th.grid } },
      rightPriceScale: { borderColor: th.border },
      timeScale: { borderColor: th.border, timeVisible: true },
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

  // 다크모드 토글 즉시 반영 — 차트는 createChart 시점 테마만 읽으므로, html.dark 클래스 변경을
  // 감시해 배경/격자/축 색을 applyOptions로 다시 적용한다(종목·인터벌을 안 바꿔도 즉시 전환).
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const chart = chartRef.current
      if (!chart) return
      const th = chartTheme()
      chart.applyOptions({
        layout: { background: { color: th.bg }, textColor: th.text },
        grid: { vertLines: { color: th.grid }, horzLines: { color: th.grid } },
        rightPriceScale: { borderColor: th.border },
        timeScale: { borderColor: th.border },
      })
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // 캔들 데이터 — 인터벌(candles) 변경 시에만 setData + fitContent.
  // (지표 토글 effect와 분리: 토글로 fitContent가 불려 줌/스크롤이 리셋되던 문제 해결)
  useEffect(() => {
    const { candle, chart } = seriesRef.current
    if (!candle || !candles.length) return
    const data = candles.map((c) => ({
      time: Math.floor(c.timestamp / 1000),
      open: c.open, high: c.high, low: c.low, close: c.close,
    }))
    candle.setData(data)
    chart.timeScale().fitContent()
  }, [candles])

  // REST 캔들이 새로 오면(인터벌·종목 변경, 주기 재동기화) 형성 중 라이브 봉을 리셋.
  useEffect(() => { liveBarRef.current = null }, [candles])

  // 실시간 슬라이딩 — livePrice 틱마다:
  //  ⑴같은 버킷이면 형성 중 봉의 종가·고저 갱신
  //  ⑵새 버킷이 시작되면 우측에 새 봉을 생성(open=현재가) → lightweight-charts가 뷰를 우측으로 밀어
  //    봉 폭은 그대로, 가장 왼쪽 봉은 화면 밖으로 사라진다(고정폭 슬라이딩).
  useEffect(() => {
    const { candle } = seriesRef.current
    if (!candle || !candles.length || livePrice == null) return
    const last = candles[candles.length - 1]
    const lastTime = Math.floor(last.timestamp / 1000)
    const bs = bucketSeconds(intervalApi)
    const nowBucket = bs ? Math.floor(Date.now() / 1000 / bs) * bs : lastTime

    if (bs && nowBucket > lastTime) {
      // REST 마지막 봉 이후의 새 버킷 → 형성 중 라이브 봉 유지/생성(open·고저를 ref에 누적)
      let bar = liveBarRef.current
      if (!bar || bar.time !== nowBucket) {
        bar = { time: nowBucket, open: livePrice, high: livePrice, low: livePrice }
        liveBarRef.current = bar
      } else {
        bar.high = Math.max(bar.high, livePrice)
        bar.low = Math.min(bar.low, livePrice)
      }
      candle.update({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: livePrice })
    } else {
      // REST 마지막 봉과 같은 버킷 → 그 봉을 형성 중으로 갱신
      candle.update({
        time: lastTime, open: last.open,
        high: Math.max(last.high, livePrice), low: Math.min(last.low, livePrice), close: livePrice,
      })
    }
  }, [livePrice, candles, intervalApi])

  // 오버레이 지표(MA·Bollinger) — candles 또는 토글 변경 시 제거 후 재생성. fitContent 없음 → 줌 유지.
  useEffect(() => {
    const { chart } = seriesRef.current
    if (!chart || !candles.length) return

    ;['ma20', 'ma60', 'bbUpper', 'bbLower', 'vwap'].forEach(k => {
      if (seriesRef.current[k]) { chart.removeSeries(seriesRef.current[k]); seriesRef.current[k] = null }
    })

    const closes = candles.map((c) => c.close)
    const times  = candles.map((c) => Math.floor(c.timestamp / 1000))

    if (indicators.vwap) {
      const vwap = calcVWAP(candles)
      const sv = chart.addSeries(LineSeries, { color: '#0891b2', lineWidth: 2, priceLineVisible: false, lastValueVisible: true })
      sv.setData(times.map((t, i) => vwap[i] !== null ? { time: t, value: vwap[i] } : null).filter(Boolean))
      seriesRef.current.vwap = sv
    }

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

  return (
    <div className="flex w-full h-full">
      <div ref={containerRef} className="flex-1 h-full min-w-0" />
      {indicators.volprofile && <VolumeProfilePanel candles={candles} />}
    </div>
  )
}

function RSIChart({ candles }: { candles: CandleItem[] }) {
  const containerRef = useRef<any>(null)
  const chartRef     = useRef<any>(null)
  const seriesRef    = useRef([])

  useEffect(() => {
    if (!containerRef.current) return
    const th = chartTheme()
    const chart = createChart(containerRef.current, {
      // attributionLogo는 LayoutOptions 소속 — layout 안에 둬야 적용됨(최상위에 두면 무시).
      layout: { background: { color: th.bg }, textColor: th.text, attributionLogo: false },
      grid: { vertLines: { color: th.grid }, horzLines: { color: th.grid } },
      rightPriceScale: { borderColor: th.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: th.border, timeVisible: true },
    })
    chartRef.current = chart
    // 새 차트엔 시리즈가 없음 — 이전(제거된) 차트의 stale 시리즈 참조를 비운다.
    // (StrictMode 더블 마운트 시 옛 차트 시리즈를 새 차트에서 removeSeries 하면 "Value is undefined" 크래시)
    seriesRef.current = []
    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', onResize)
    // 다크모드 토글 즉시 반영(메인 차트와 동일).
    const obs = new MutationObserver(() => {
      if (!chartRef.current) return
      const t2 = chartTheme()
      chartRef.current.applyOptions({
        layout: { background: { color: t2.bg }, textColor: t2.text },
        grid: { vertLines: { color: t2.grid }, horzLines: { color: t2.grid } },
        rightPriceScale: { borderColor: t2.border },
        timeScale: { borderColor: t2.border },
      })
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { window.removeEventListener('resize', onResize); obs.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = [] }
  }, [])

  useEffect(() => {
    if (!chartRef.current || !candles.length) return
    const chart = chartRef.current
    // v5에서 getSeries()는 IPaneApi 소속(chart엔 없음) → 직접 만든 시리즈를 ref로 추적해 제거
    seriesRef.current.forEach(s => chart.removeSeries(s))
    seriesRef.current = []

    const closes = candles.map((c) => c.close)
    const times  = candles.map((c) => Math.floor(c.timestamp / 1000))
    const rsi    = calcRSI(closes)

    const rsiSeries = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true })
    rsiSeries.setData(times.map((t, i) => rsi[i] !== null ? { time: t, value: rsi[i] } : null).filter(Boolean))

    const ob = chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
    const os = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
    const validTimes = times.filter((_, i) => rsi[i] !== null)
    if (validTimes.length) {
      ob.setData(validTimes.map((t) => ({ time: t, value: 70 })))
      os.setData(validTimes.map((t) => ({ time: t, value: 30 })))
    }
    seriesRef.current = [rsiSeries, ob, os] as any
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

function fmtVolume(v: any) {
  if (v >= 1e8) return (v / 1e8).toFixed(0) + '억'
  return v.toLocaleString()
}

function fmtTime(ts: any) {
  return new Date(ts * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const pctSigned = (v: any) => (v > 0 ? '+' : '') + (v ?? 0).toFixed(2) + '%'

// 주요 지표 한 칸
function Metric({ label, value, color = 'text-gray-800 dark:text-gray-100', hint = null }: { label?: ReactNode; value?: ReactNode; color?: string; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">{label}</div>
      <div className={`text-base font-bold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</div>}
    </div>
  )
}

// ── 본문 (재사용 가능 컴포넌트) ────────────────────────────
// CoinList(master-detail)에서도 이 컴포넌트를 그대로 우측 메인에 끼워 쓴다.
// market을 prop으로 받아 라우터 의존을 없앴고, 단독 라우트는 default export wrapper가 useParams로 넘긴다.
// 이 코인이 현재 시그널(모멘텀 롱·돌파)에 해당하면 배지로 — "보기"에서 "액션"으로 잇는 연결.
function CoinSignalBadges({ market }: { market: string }) {
  const { data } = useSignals()
  const mine = (data.items || []).filter((s) => s.market === market)
  if (!mine.length) return null
  const meta: any = {
    momentum: { label: '모멘텀 롱', cls: 'text-brand-600 bg-brand-50 dark:bg-brand-500/10' },
    breakout: { label: '돌파/급등', cls: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10' },
  }
  const kinds = [...new Set(mine.map((s) => s.kind))]
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {kinds.map((k) => (
        <span key={k} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta[k]?.cls || 'text-gray-500 bg-gray-100'}`}
          title="실행 가능한 시그널(인샘플·생존편향 한계)">★ {meta[k]?.label || k}</span>
      ))}
    </div>
  )
}

export function CoinDetailView({ market }: { market: string }) {
  const [intervalIdx, setIntervalIdx] = useState(7)
  const [indicators, setIndicators]   = useState({ ma: false, bollinger: false, rsi: false, vwap: false, volprofile: false })

  const { orderbook: restOb } = useOrderbook(market)
  const { trades: restTrades } = useTrades(market)
  // 실시간 호가·체결(WS). 연결 전/초기엔 비어 있으니 REST 값으로 폴백.
  const { orderbook: liveOb, trades: liveTrades } = useMarketStream(market)
  const orderbook = liveOb ?? restOb
  const trades = useMemo(() => {
    const seen = new Set()
    const merged: any[] = []
    for (const t of [...liveTrades, ...restTrades]) {
      const key = `${t.timestamp}-${t.price}-${t.volume}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({ ...t, _key: key })
    }
    // 항상 최신이 맨 위(시각 내림차순) — WS 새 체결이 정확히 맨 위에서 깜빡이도록.
    merged.sort((a, b) => b.timestamp - a.timestamp)
    return merged.slice(0, 30)
  }, [liveTrades, restTrades])
  const { candles, loading: candlesLoading } = useCandles(market, INTERVALS[intervalIdx].api, INTERVALS[intervalIdx].count)
  const { data: corrData }    = useCorrelation(market)
  // 시세(ticker)는 프리페치된 tickers 목록에서 즉시 가져온다(별도 fetch·별도 로딩 없음 →
  // 좌측만 로딩되고 우측 사이드바가 보이는 분리 현상 제거). 페이지 로딩 게이트는 CoinList가 tickers로 소유.
  const { tickers }           = useTickers()
  const liveTickers           = useLiveTickers(tickers)   // 점유율·거래대금순위 라이브 계산용
  const ticker                = useMemo(() => tickers.find((t) => t.market === market), [tickers, market])
  const { data: coinStats }   = useCoinStats()
  const { data: garch }       = useGarch(market)
  const liveTicker            = useLivePrice(market)  // 상단 가격 헤더 실시간
  const priceFlash            = usePulse(liveTicker?.trade_price ?? ticker?.trade_price)

  // 라이브 파생값 — hooks 규칙상 early return 앞에서 계산(ticker 없을 수 있어 옵셔널 접근).
  const stat = coinStats.find((s) => s.market === market)
  const lp = liveTicker?.trade_price ?? ticker?.trade_price ?? 0   // 현재가(라이브 우선)
  // 거래대금 순위 — 실시간 거래대금으로 재정렬한 순위(1위가 바뀌면 즉시 반영).
  const volRank = useMemo(() => {
    const sorted = [...liveTickers].sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h)
    const i = sorted.findIndex(t => t.market === market)
    return i >= 0 ? i + 1 : null
  }, [liveTickers, market])
  // 1개월 수익률(라이브) — coinStats의 return_1m로 '한 달 전 가격'을 역산 후 현재가(라이브)로 재계산.
  const liveReturn1m = useMemo(() => {
    const r0 = stat?.return_1m
    if (r0 == null || !ticker) return null
    const closes0 = ticker.trade_price / (1 + r0 / 100)
    return closes0 > 0 ? (lp / closes0 - 1) * 100 : r0
  }, [stat, ticker, lp])

  // tickers는 CoinList에서 페이지 게이트로 보장되지만, 직접 진입 등 예외 시 인라인 로딩.
  if (!ticker) return <PageLoading message="시세를 불러오는 중입니다…" />

  // 실시간 시세(WS) 우선, 없으면 REST(ticker) 폴백 — 상단 가격 헤더가 라이브로 갱신된다.
  const live = liveTicker
  const price = live?.trade_price ?? ticker.trade_price
  const chg = live?.change ?? ticker.change
  const changePrice = live?.change_price ?? ticker.change_price
  const changeRate = live?.change_rate ?? ticker.change_rate
  const isRise = chg === 'RISE'
  const isFall = chg === 'FALL'
  const priceColor = isRise ? 'text-red-500' : isFall ? 'text-blue-500' : 'text-gray-700 dark:text-gray-200'

  // 추가 지표 — 현재가/거래대금에 종속되는 것들은 실시간 값으로 계산(가격 움직이면 즉시 갱신).
  const liveVol = live?.acc_trade_price_24h ?? ticker.acc_trade_price_24h
  const totalVol = liveTickers.reduce((s: any, t: any) => s + t.acc_trade_price_24h, 0)
  const share = totalVol ? (liveVol / totalVol) * 100 : 0   // 시장 점유율(라이브 거래대금)
  // 52주 위치 — 현재가(라이브)가 분자라 가격이 오르면 바가 즉시 우측으로.
  const w52span = ticker.w52_high - ticker.w52_low
  const w52pos = w52span > 0 ? Math.max(0, Math.min(100, (price - ticker.w52_low) / w52span * 100)) : 0
  // 호가 막대폭은 표시된 호가의 최대 잔량 대비 상대 스케일 (임의 배율 대신 깊이 비교가 의미 있게)
  const maxDepth = orderbook
    ? Math.max(...orderbook.asks.map((a: any) => a.size), ...orderbook.bids.map((b: any) => b.size), 1e-9)
    : 1
  // 호가 매수/매도 압력 — 표시된 호가의 매수(bid)·매도(ask) 총잔량 비율(체결강도 풍 단순화, 추가 호출 0)
  const bidDepth = orderbook ? orderbook.bids.reduce((s: any, b: any) => s + b.size, 0) : 0
  const askDepth = orderbook ? orderbook.asks.reduce((s: any, a: any) => s + a.size, 0) : 0
  const depthSum = bidDepth + askDepth
  const bidPct = depthSum > 0 ? (bidDepth / depthSum) * 100 : 50

  function toggleIndicator(key: any) {
    setIndicators(prev => ({ ...prev, [key]: !(prev as any)[key] }))
  }

  return (
    <div className="space-y-4">
      {/* 상단 가격 정보 */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md px-6 py-4">
        <div className="flex items-center gap-10">
          <div className="min-w-[120px]">
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{market}</div>
            <div className="text-base font-semibold text-gray-800 dark:text-gray-100">{ticker.korean_name}</div>
            <CoinSignalBadges market={market} />
          </div>
          <div>
            <div className="text-3xl font-bold tracking-tight">
              <span className={`inline-block rounded px-1 ${priceColor} ${priceFlash ? `flash-${priceFlash}` : ''}`}>
                {price.toLocaleString()}
              </span>
              <span className="text-sm font-normal ml-1 text-gray-400 dark:text-gray-500">KRW</span>
            </div>
            <div className={`text-sm mt-1 ${priceColor}`}>
              {isRise ? '▲' : isFall ? '▼' : ''}{' '}
              {changePrice.toLocaleString()} ({isRise ? '+' : ''}{(changeRate * 100).toFixed(2)}%)
            </div>
          </div>
          <div className="flex gap-7 ml-4 text-sm border-l border-gray-100 dark:border-[#232d40] pl-8">
            {[
              ['고가',       ticker.high_price.toLocaleString(),        'text-red-500'],
              ['저가',       ticker.low_price.toLocaleString(),         'text-blue-500'],
              ['전일종가',   ticker.prev_closing_price.toLocaleString(), 'text-gray-700 dark:text-gray-200'],
              ['거래대금(24h)', fmtVolume(ticker.acc_trade_price_24h),  'text-gray-700 dark:text-gray-200'],
            ].map(([label, value, color]) => (
              <div key={label}>
                <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</div>
                <div className={`font-medium ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 주요 지표 + 52주 위치 — 변동성·수익률·시장점유 + GARCH 리스크(퀀트 통합) */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-4">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">주요 지표</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Metric label="거래대금 순위" value={volRank ? `#${volRank}` : '—'} hint={`전체 ${tickers.length}종`} />
            <Metric label="30일 변동성" value={stat ? stat.volatility.toFixed(2) + '%' : '—'} hint="일간 표준편차" />
            <Metric label="1개월 수익률" value={liveReturn1m != null ? pctSigned(liveReturn1m) : '—'}
              color={liveReturn1m != null ? (liveReturn1m >= 0 ? 'text-red-500' : 'text-blue-500') : 'text-gray-800 dark:text-gray-100'} />
            <Metric label="시장 점유율" value={share.toFixed(2) + '%'} hint="24h 거래대금 비중" />
            <Metric label="BTC 베타" value={stat ? stat.btc_beta.toFixed(2) : '—'}
              hint={stat ? (stat.btc_beta > 1 ? 'BTC보다 민감' : stat.btc_beta < 0 ? '역행' : 'BTC보다 둔감') : 'BTC 민감도'} />
            <Metric label="GARCH 연변동성" value={garch.current_vol_annual ? garch.current_vol_annual.toFixed(1) + '%' : '—'}
              hint={garch.persistence ? `지속성 ${garch.persistence.toFixed(2)}` : '예측 중'} />
            <Metric label="1일 95% VaR" value={garch.var_95 ? '-' + garch.var_95.toFixed(2) + '%' : '—'}
              color="text-blue-500" hint={garch.cvar_95 ? `경험 VaR -${garch.hist_var_95.toFixed(1)}% · CVaR -${garch.cvar_95.toFixed(1)}%` : '예상 최대손실'} />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">52주 위치</div>
            {ticker.is_52w_high && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">오늘 신고가</span>}
            {ticker.is_52w_low && <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">오늘 신저가</span>}
          </div>
          <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(to right, #bfdbfe, #f3f4f6, #fecaca)' }}>
            <div className="absolute top-1/2 w-3 h-3 rounded-full bg-brand-500 border-2 border-white shadow"
              style={{ left: `${w52pos}%`, transform: 'translate(-50%, -50%)' }} />
          </div>
          <div className="flex justify-between text-[11px] mt-2">
            <span className="text-blue-500">{ticker.w52_low.toLocaleString()}</span>
            <span className="text-gray-400 dark:text-gray-500">현재 {w52pos.toFixed(0)}%</span>
            <span className="text-red-500">{ticker.w52_high.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 차트 + 호가창 (카드 높이를 맞추고, 호가창은 내부 스크롤) */}
      <div className="grid grid-cols-12 gap-4 h-[560px]">
        <div className="col-span-9 bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden flex flex-col">
          {/* 시간 탭 + 지표 토글 */}
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#232d40] px-2 shrink-0">
            <div className="flex">
              {INTERVALS.map((iv, i) => (
                <button
                  key={iv.label}
                  onClick={() => setIntervalIdx(i)}
                  className={`px-3 py-2.5 text-xs font-medium border-b-2 -mb-px cursor-pointer transition-colors ${
                    intervalIdx === i
                      ? 'border-[#093687] text-[#093687]'
                      : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600'
                  }`}
                >
                  {iv.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 pr-2">
              {[
                { key: 'ma',         label: 'MA',        hex: '#6366f1' },
                { key: 'bollinger',  label: 'Bollinger', hex: '#10b981' },
                { key: 'vwap',       label: 'VWAP',      hex: '#0891b2' },
                { key: 'volprofile', label: '거래량대',   hex: '#64748b' },
                { key: 'rsi',        label: 'RSI',       hex: '#8b5cf6' },
              ].map(({ key, label, hex }) => (
                <button
                  key={key}
                  onClick={() => toggleIndicator(key)}
                  className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${
                    (indicators as any)[key] ? 'text-white' : 'bg-gray-100 dark:bg-[#222c3e] text-gray-500 dark:text-gray-400 hover:bg-gray-200'
                  }`}
                  style={(indicators as any)[key] ? { backgroundColor: hex } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 pb-3 pt-2 flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 relative">
              {/* 캔들은 종목/인터벌별 on-demand fetch라 페이지를 막지 않고 차트 자리에 인라인 로딩 */}
              {candlesLoading && candles.length === 0 && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/70 dark:bg-[#1a2234]/70">
                  <Spinner />
                  <span className="text-xs text-gray-400 dark:text-gray-500">차트 불러오는 중…</span>
                </div>
              )}
              <CandlestickChart candles={candles} indicators={indicators} livePrice={live?.trade_price} intervalApi={INTERVALS[intervalIdx].api} />
            </div>
            {indicators.rsi && (
              <div className="mt-1 border-t border-gray-100 dark:border-[#232d40] pt-1 shrink-0">
                <div className="text-xs text-gray-400 dark:text-gray-500 mb-1 px-1">RSI(14)</div>
                <RSIChart candles={candles} />
              </div>
            )}
          </div>
        </div>

        {/* 호가창 (차트와 같은 높이, 현재가 중심 스크롤) */}
        <div className="col-span-3 bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden flex flex-col">
          <div className="px-3 py-2.5 border-b border-gray-100 dark:border-[#232d40] text-xs font-semibold text-gray-600 dark:text-gray-300 shrink-0">호가</div>
          {orderbook && (
            <div className="px-3 py-2 border-b border-gray-100 dark:border-[#232d40] shrink-0">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-red-500 font-medium">매수 {bidPct.toFixed(0)}%</span>
                <span className="text-gray-400 dark:text-gray-500">매수/매도 잔량</span>
                <span className="text-blue-500 font-medium">매도 {(100 - bidPct).toFixed(0)}%</span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 dark:bg-[#222c3e]">
                <div className="bg-red-400" style={{ width: `${bidPct}%` }} />
                <div className="bg-blue-400" style={{ width: `${100 - bidPct}%` }} />
              </div>
            </div>
          )}
          {orderbook ? (
            <div className="text-xs flex-1 min-h-0 overflow-y-auto">
              {[...orderbook.asks].reverse().map((ask, i) => (
                <div key={i} className="relative flex items-center px-3 py-1 hover:bg-blue-50">
                  <div className="absolute right-0 top-0 bottom-0 bg-blue-50" style={{ width: `${(ask.size / maxDepth) * 90}%` }} />
                  <span className="relative z-10 flex-1 text-blue-500 font-medium">{ask.price.toLocaleString()}</span>
                  <span className="relative z-10 text-gray-400 dark:text-gray-500">{ask.size.toFixed(4)}</span>
                </div>
              ))}
              <div className={`flex items-center justify-center py-1.5 font-bold text-sm border-y border-gray-200 dark:border-[#2c3850] bg-gray-50 dark:bg-[#141b29] ${priceColor}`}>
                {ticker.trade_price.toLocaleString()}
              </div>
              {orderbook.bids.map((bid: any, i: any) => (
                <div key={i} className="relative flex items-center px-3 py-1 hover:bg-red-50">
                  <div className="absolute right-0 top-0 bottom-0 bg-red-50" style={{ width: `${(bid.size / maxDepth) * 90}%` }} />
                  <span className="relative z-10 flex-1 text-red-500 font-medium">{bid.price.toLocaleString()}</span>
                  <span className="relative z-10 text-gray-400 dark:text-gray-500">{bid.size.toFixed(4)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-gray-400 dark:text-gray-500">로딩 중...</div>
          )}
        </div>
      </div>

      {/* 체결내역 (종목 기본정보는 상단 가격 헤더와 중복되어 제거) */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#232d40] text-sm font-semibold text-gray-700 dark:text-gray-200">체결 내역</div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#141b29] border-b border-gray-100 dark:border-[#232d40] text-xs text-gray-400 dark:text-gray-500">
                <th className="px-3 py-2 text-left font-medium">시간</th>
                <th className="px-3 py-2 text-right font-medium">가격</th>
                <th className="px-3 py-2 text-right font-medium">수량</th>
                <th className="px-3 py-2 text-center font-medium">구분</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((tr, i) => (
                <tr key={tr._key ?? i} className={`border-t border-gray-50 text-xs ${i === 0 && tr._id ? (tr.side === 'BID' ? 'flash-up' : 'flash-down') : ''}`}>
                  <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500">{fmtTime(tr.timestamp)}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${tr.side === 'BID' ? 'text-red-500' : 'text-blue-500'}`}>
                    {tr.price.toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{tr.volume.toFixed(4)}</td>
                  <td className={`px-3 py-1.5 text-center font-medium ${tr.side === 'BID' ? 'text-red-500' : 'text-blue-500'}`}>
                    {tr.side === 'BID' ? '매수' : '매도'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 상관관계 분석 — 동조(양의 상관) + 헤지 후보(음의 상관) 양쪽을 모두 노출 */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">타 종목 상관관계</div>
          <Link to="/research/structure#network" className="text-xs text-brand-600 hover:underline">전체 상관 네트워크 →</Link>
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">60일 일봉 종가 기준 피어슨 상관계수 · 함께 움직이는 종목과 반대로 움직이는(헤지) 종목</div>

        <div className="text-[11px] font-medium text-red-500 mb-1.5">가장 함께 움직임 (동조)</div>
        <div className="grid grid-cols-7 gap-2">
          {corrData.slice(0, 7).map((item) => (
            <div key={item.market} className={`rounded-md px-3 py-2.5 text-center ${corrColor(item.correlation)}`}>
              <div className="text-xs font-semibold">{item.market.replace('KRW-', '')}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.korean_name}</div>
              <div className="text-sm font-bold mt-1">{item.correlation.toFixed(2)}</div>
            </div>
          ))}
        </div>

        <div className="text-[11px] font-medium text-blue-500 mt-4 mb-1.5">가장 반대로 움직임 (헤지 후보)</div>
        <div className="grid grid-cols-7 gap-2">
          {corrData.slice(-7).reverse().map((item) => (
            <div key={item.market} className={`rounded-md px-3 py-2.5 text-center ${corrColor(item.correlation)}`}>
              <div className="text-xs font-semibold">{item.market.replace('KRW-', '')}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.korean_name}</div>
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
  return <CoinDetailView market={market ?? 'KRW-BTC'} />
}
