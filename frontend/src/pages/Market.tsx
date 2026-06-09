import { Link, useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, YAxis, Tooltip, ResponsiveContainer, Treemap,
  ComposedChart, Line, XAxis, CartesianGrid, Legend,
} from 'recharts'
import { useTickers } from '../hooks/useTickers'
import { useAdvanceDecline } from '../hooks/useAnalysis'
import { LivePrice, LiveChangeRate } from '../components/LiveCells'
import PageLoading from '../components/ui/PageLoading'
import PageError from '../components/ui/PageError'

const FEATURED_LIMIT = 4   // 상단 대표 카드 수 (거래대금 상위)

const RANK_LIMIT = 10      // 상승률·하락률·거래대금 표기 순위 (한 화면에 부담 없는 분량으로 축소)
const TREEMAP_LIMIT = 30   // 시장 현황 트리맵에 표시할 메이저 종목 수 (거래대금 상위)
const W52_LIMIT = 30       // 52주 신고/신저 배지 대상 = 거래대금 상위 N종 (유동성 낮은 잡코인 신저가 노이즈 제외)

function fmtRate(r) {
  return (r > 0 ? '+' : '') + (r * 100).toFixed(2) + '%'
}

function fmtKrwShort(v) {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + '조'
  if (v >= 1e8) return Math.round(v / 1e8).toLocaleString() + '억'
  return v.toLocaleString()
}

// 시장 요약 스트립 — 흩어져 있던 KPI·공포탐욕·상승하락 수를 숫자 한 줄로 응집(대시보드에서 이관).
function SummaryStrip({ tickers }) {
  const total = tickers.reduce((s, t) => s + t.acc_trade_price_24h, 0)
  const rise = tickers.filter(t => t.change === 'RISE').length
  const fall = tickers.filter(t => t.change === 'FALL').length
  const avg = tickers.length ? tickers.reduce((s, t) => s + t.change_rate, 0) / tickers.length * 100 : 0
  const w52h = tickers.filter(t => t.is_52w_high).length
  const w52l = tickers.filter(t => t.is_52w_low).length
  const top10 = [...tickers].sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h)
    .slice(0, 10).reduce((s, t) => s + t.acc_trade_price_24h, 0)
  const conc = total ? (top10 / total * 100).toFixed(1) : '0'
  const riseRatio = tickers.length ? (rise / tickers.length) * 100 : 50
  const changeScore = Math.min(100, Math.max(0, avg * 5 + 50))
  const fg = Math.round(riseRatio * 0.6 + changeScore * 0.4)

  const items = [
    { label: '24h 총 거래대금', node: <span>{fmtKrwShort(total)}<span className="text-[11px] text-gray-400 ml-0.5">KRW</span></span> },
    { label: '평균 등락률', node: <span className={avg >= 0 ? 'text-red-500' : 'text-blue-500'}>{(avg >= 0 ? '+' : '') + avg.toFixed(2)}%</span> },
    { label: '상승 / 하락', node: <span><span className="text-red-500">{rise}</span><span className="text-gray-300 mx-1">/</span><span className="text-blue-500">{fall}</span></span> },
    { label: '52주 신고 / 신저', node: <span><span className="text-red-500">{w52h}</span><span className="text-gray-300 mx-1">/</span><span className="text-blue-500">{w52l}</span></span> },
    { label: '거래대금 집중도', node: <span>{conc}%<span className="text-[11px] text-gray-400 ml-1">상위10</span></span> },
    { label: '공포·탐욕', node: <span className={fg >= 50 ? 'text-red-500' : 'text-blue-500'}>{fg}</span> },
  ]
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-gray-100 dark:divide-[#232d40]">
      {items.map(it => (
        <div key={it.label} className="px-4 py-3">
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{it.label}</div>
          <div className="text-base font-bold tabular-nums text-gray-800 dark:text-gray-100">{it.node}</div>
        </div>
      ))}
    </div>
  )
}

function changeColor(change) {
  if (change === 'RISE') return 'text-red-500'
  if (change === 'FALL') return 'text-blue-500'
  return 'text-gray-600 dark:text-gray-300'
}

function MiniCard({ ticker }) {
  const isRise = ticker.change === 'RISE'
  const color = isRise ? '#ef4444' : '#3b82f6'
  const data = ticker.sparkline.map(v => ({ v }))

  return (
    <Link to={`/coins/${ticker.market}`} className="block bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-4 hover:border-gray-300 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500">{ticker.market.replace('KRW-', '')}</div>
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{ticker.korean_name}</div>
        </div>
        <div className="text-right">
          <div className={`text-base font-bold ${changeColor(ticker.change)}`}>
            {ticker.trade_price.toLocaleString()}<span className="text-xs font-medium text-gray-400 dark:text-gray-500 ml-0.5">KRW</span>
          </div>
          <div className={`text-xs mt-0.5 ${changeColor(ticker.change)}`}>
            {fmtRate(ticker.change_rate)}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={48}>
        <AreaChart data={data} margin={{ top: 3, bottom: 3, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={`g-${ticker.market}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* 변동폭이 작아도 보이도록 Y축을 데이터 범위로 타이트하게 (0 기준 X) */}
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: '2px 6px' }}
            formatter={(v) => v.toLocaleString() + ' KRW'}
            labelFormatter={() => ''}
          />
          <Area type="monotone" dataKey="v" name="가격" stroke={color} strokeWidth={1.5} fill={`url(#g-${ticker.market})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Link>
  )
}

function RankTable({ title, rows, color, onRowClick }) {
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
      <div className={`px-4 py-3 border-b border-gray-100 dark:border-[#232d40] text-sm font-semibold ${color}`}>{title}</div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 dark:bg-[#141b29] text-xs text-gray-400 dark:text-gray-500">
            <th className="px-3 py-2 text-left font-medium">종목</th>
            <th className="px-3 py-2 text-right font-medium">현재가</th>
            <th className="px-3 py-2 text-right font-medium">등락률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr
              key={t.market}
              onClick={() => onRowClick(t.market)}
              className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
            >
              <td className="px-3 py-2.5">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.korean_name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t.market.replace('KRW-', '')}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right text-sm">
                <LivePrice ticker={t} />
              </td>
              <td className="px-3 py-2.5 text-right text-sm">
                <LiveChangeRate ticker={t} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function W52Badges({ tickers }) {
  // 거래대금 상위 N종 안에서만 52주 경신을 추린다 (메이저 기준 — 유동성 낮은 잡코인 신저가 노이즈 제외)
  const major = [...tickers].sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, W52_LIMIT)
  const highs = major.filter(t => t.is_52w_high)
  const lows  = major.filter(t => t.is_52w_low)

  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md px-5 py-3.5 flex items-center gap-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-red-500 flex-shrink-0 w-20">52주 신고가</span>
        {highs.length === 0
          ? <span className="text-xs text-gray-400 dark:text-gray-500">없음</span>
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
          ? <span className="text-xs text-gray-400 dark:text-gray-500">없음</span>
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

function TreemapCell({ x, y, width, height, name, change_rate }: any) {
  if (!width || !height) return null
  const abs = Math.abs(change_rate)
  const opacity = Math.min(0.9, 0.25 + abs * 6)
  const fill = change_rate >= 0
    ? `rgba(239,68,68,${opacity})`
    : `rgba(59,130,246,${opacity})`
  const sign = change_rate > 0 ? '+' : ''

  // 칸 크기에 맞춰 폰트를 줄여 작은 칸에도 가능한 한 종목명을 표시한다(가로=이름 길이, 세로=칸 높이 기준).
  // %는 두 줄이 들어갈 여유가 있을 때만 함께 표시.
  const nameSize = Math.min(13, width / (name.length * 0.62), height / 2.4)
  const showName = nameSize >= 6.5 && width > 24
  const showPct = showName && height > 34 && width > 38
  const pctSize = Math.max(8, Math.min(11, nameSize - 1))

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={1} />
      {showName && (
        <text
          x={x + width / 2}
          y={y + height / 2 + (showPct ? -3 : nameSize * 0.35)}
          textAnchor="middle" fill="#fff" fontSize={nameSize} fontWeight="600"
        >
          {name}
        </text>
      )}
      {showPct && (
        <text
          x={x + width / 2}
          y={y + height / 2 + pctSize + 2}
          textAnchor="middle" fill="#fff" fontSize={pctSize}
        >
          {sign}{(change_rate * 100).toFixed(2)}%
        </text>
      )}
    </g>
  )
}

function fmtDay(ts) {
  const d = new Date(ts * 1000)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ADTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md shadow-sm px-3 py-2 text-xs">
      <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{p.label}</div>
      <div className="text-brand-600">A-D 라인 {p.ad >= 0 ? '+' : ''}{p.ad}</div>
      <div className="text-gray-500 dark:text-gray-400">시장지수 {p.index.toFixed(1)}</div>
      <div className="mt-1 text-gray-400 dark:text-gray-500">
        <span className="text-red-500">▲{p.advancers}</span> · <span className="text-blue-500">▼{p.decliners}</span>
      </div>
    </div>
  )
}

// Advance-Decline 라인 — 시장 폭의 추세. 시장지수는 오르는데 A-D가 안 오르면 소수 대형주만
// 끌어올린 것(divergence). 거래대금 상위 100종, 자체 로딩(tickers와 독립).
function ADLineChart() {
  const { data, loading } = useAdvanceDecline()
  const rows = data.points.map(p => ({
    label: fmtDay(p.time), ad: p.ad_line, index: p.index,
    advancers: p.advancers, decliners: p.decliners,
  }))
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-[#232d40] flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          시장 폭 추세 · Advance-Decline 라인
          <span className="text-xs font-normal text-gray-400 dark:text-gray-500"> · 거래대금 상위 {data.n}종</span>
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500">매일 (상승−하락) 종목 수 누적 · 시장지수와 벌어지면 소수 종목 장세</div>
      </div>
      <div className="p-2">
        {loading ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">불러오는 중…</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={rows} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} minTickGap={28} />
              <YAxis yAxisId="ad" tick={{ fontSize: 11, fill: '#1763b6' }} width={48} />
              <YAxis yAxisId="idx" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} width={44}
                domain={['dataMin', 'dataMax']} />
              <Tooltip content={<ADTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="ad" type="monotone" dataKey="ad" name="A-D 라인(시장 폭)"
                stroke="#1763b6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="idx" type="monotone" dataKey="index" name="시장지수(동일가중)"
                stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export default function Market() {
  const { tickers, loading, error, retry } = useTickers()
  const ad = useAdvanceDecline()   // 자식(ADLineChart)도 호출하지만 디둡 — 게이트 판정용으로 함께 모음
  const navigate = useNavigate()

  // 하나라도 로딩/에러면 헤더·푸터만 남기고 전체를 로딩/에러 페이지로(다른 컴포넌트 비노출).
  if (error || ad.error) return <PageError onRetry={() => { retry?.(); ad.retry?.() }} />
  if (loading || ad.loading) return <PageLoading />

  const sorted = [...tickers].sort((a, b) => b.change_rate - a.change_rate)
  const byVolume = [...tickers].sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h)
  const featured = byVolume.slice(0, FEATURED_LIMIT)  // 거래대금 상위 4개
  // 트리맵은 종목이 많으면 정신없어 거래대금 상위(메이저)만 표시
  const treemapData = byVolume.slice(0, TREEMAP_LIMIT).map(t => ({
    name: t.market.replace('KRW-', ''),
    size: t.acc_trade_price_24h,
    change_rate: t.change_rate,
  }))
  const goCoin = m => navigate(`/coins/${m}`)


  return (
    <div className="space-y-4">

      {/* 시장 요약 스트립 (KPI·공포탐욕·상승하락 — 대시보드에서 이관) */}
      <SummaryStrip tickers={tickers} />

      {/* 주요 종목 (거래대금 상위) */}
      <div>
        <div className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">주요 종목 · 거래대금 상위 {FEATURED_LIMIT}</div>
        <div className="grid grid-cols-4 gap-4">
          {featured.map(t => <MiniCard key={t.market} ticker={t} />)}
        </div>
      </div>

      {/* 52주 신고가/신저가 배지 */}
      <W52Badges tickers={tickers} />

      {/* 상승률 | 하락률 (각 RANK_LIMIT위). 거래대금 순위는 아래 트리맵이 더 풍부하게 보여줘 표는 제거. */}
      <div className="grid grid-cols-2 gap-4 items-start">
        <RankTable
          title="상승률 상위"
          rows={sorted.slice(0, RANK_LIMIT)}
          color="text-red-500"
          onRowClick={goCoin}
        />
        <RankTable
          title="하락률 상위"
          rows={[...sorted].reverse().slice(0, RANK_LIMIT)}
          color="text-blue-500"
          onRowClick={goCoin}
        />
      </div>

      {/* 시장 현황 트리맵 (거래대금 상위 메이저) */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#232d40] flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            거래대금 비중 지도 <span className="text-xs font-normal text-gray-400 dark:text-gray-500">· 거래대금 상위 {TREEMAP_LIMIT}종목</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(239,68,68,0.7)' }} />상승
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(59,130,246,0.7)' }} />하락
            </span>
            <span className="text-gray-300">|</span>
            <span>칸 크기 = 거래대금 · 진할수록 등락폭 큼</span>
          </div>
        </div>
        <div className="p-2">
          <ResponsiveContainer width="100%" height={320}>
            <Treemap data={treemapData} dataKey="size" content={<TreemapCell />} isAnimationActive={false} />
          </ResponsiveContainer>
        </div>
      </div>

      {/* 시장 폭 추세 (A-D 라인) — 시장지수와의 괴리로 장세의 폭을 진단 */}
      <ADLineChart />

      {/* 리스크/군집 심화는 전용 페이지로 일원화(중복 제거) — 변동성 분포·VaR은 리스크 탭, 산점도·K-means는 분석>클러스터링 */}
      <div className="grid grid-cols-2 gap-4">
        <Link to="/risk" className="block bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5 hover:border-brand-300 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">리스크 분포 · VaR</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">전 종목 변동성 분포와 1일 95% VaR 랭킹은 <span className="text-brand-600 font-medium">리스크</span>에서 봅니다</div>
            </div>
            <span className="text-brand-600 text-sm font-medium whitespace-nowrap">리스크 →</span>
          </div>
        </Link>
        <Link to="/structure#cluster" className="block bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5 hover:border-brand-300 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">리스크-수익 분포 · 종목 군집</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">변동성 × 수익률 산점도와 K-means 군집은 <span className="text-brand-600 font-medium">분석 → 클러스터링</span>에서 봅니다</div>
            </div>
            <span className="text-brand-600 text-sm font-medium whitespace-nowrap">분석으로 →</span>
          </div>
        </Link>
      </div>
    </div>
  )
}
