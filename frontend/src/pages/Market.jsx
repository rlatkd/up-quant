import { Link, useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Treemap,
  ScatterChart, Scatter, ZAxis, CartesianGrid, ReferenceLine,
} from 'recharts'
import { useTickers } from '../hooks/useTickers'
import { useCoinStats } from '../hooks/useAnalysis'
import CartButton from '../components/CartButton'

const FEATURED_LIMIT = 4   // 상단 대표 카드 수 (거래대금 상위)

const RANK_LIMIT = 10      // 상승률·하락률·거래대금 표기 순위 (한 화면에 부담 없는 분량으로 축소)
const TREEMAP_LIMIT = 30   // 시장 현황 트리맵에 표시할 메이저 종목 수 (거래대금 상위)
const W52_LIMIT = 30       // 52주 신고/신저 배지 대상 = 거래대금 상위 N종 (유동성 낮은 잡코인 신저가 노이즈 제외)
const SCATTER_LIMIT = 100  // 리스크-수익 산점도 대상 = 거래대금 상위 N종 (261종 전부는 너무 빽빽해 메이저+준메이저로 좁힘)

function fmtRate(r) {
  return (r > 0 ? '+' : '') + (r * 100).toFixed(2) + '%'
}

// 리스크-수익 산점도 유틸 — 대부분 종목이 한곳에 모이고 일부만 극단값이라,
// 축은 분포 본체(IQR 펜스)까지만 그리고 스케일 밖 종목은 아래 표로 분리한다.
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
    lo: Math.max(s[0], q1 - k * iqr),
    hi: Math.min(s[s.length - 1], q3 + k * iqr),
  }
}
const padDomain = (lo, hi) => { const p = (hi - lo) * 0.05 || 0.5; return [lo - p, hi + p] }

// 색상 = 1개월 수익률(상승 빨강·하락 파랑·보합 회색, 절대값 클수록 진하게).
const lerp = (a, b, t) => Math.round(a + (b - a) * t)
function returnColor(r) {
  const t = Math.min(1, Math.abs(r) / 30)
  const base = [148, 163, 184]
  const tgt = r >= 0 ? [239, 68, 68] : [59, 130, 246]
  return `rgb(${lerp(base[0], tgt[0], t)}, ${lerp(base[1], tgt[1], t)}, ${lerp(base[2], tgt[2], t)})`
}

function ScatterDot({ cx, cy, payload }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="transparent" />
      <circle cx={cx} cy={cy} r={3.5} fill={payload.color} fillOpacity={0.8} stroke="#fff" strokeWidth={0.5} />
    </g>
  )
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
    <Link to={`/coins/${ticker.market}`} className="block bg-white border border-gray-200 rounded-md p-4 hover:border-gray-300 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-xs text-gray-400">{ticker.market.replace('KRW-', '')}</div>
          <div className="text-sm font-semibold text-gray-800">{ticker.korean_name}</div>
        </div>
        <div className="text-right">
          <div className={`text-base font-bold ${changeColor(ticker.change)}`}>
            {ticker.trade_price.toLocaleString()}<span className="text-xs font-medium text-gray-400 ml-0.5">KRW</span>
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
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className={`px-4 py-3 border-b border-gray-100 text-sm font-semibold ${color}`}>{title}</div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-400">
            <th className="w-6"></th>
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
              <td className="pl-2 pr-1 py-2.5 text-center"><CartButton market={t.market} /></td>
              <td className="px-3 py-2.5">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-800">{t.korean_name}</span>
                  <span className="text-xs text-gray-400 mt-0.5">{t.market.replace('KRW-', '')}</span>
                </div>
              </td>
              <td className={`px-3 py-2.5 text-right text-sm font-medium ${changeColor(t.change)}`}>
                {t.trade_price.toLocaleString()}
              </td>
              <td className={`px-3 py-2.5 text-right text-sm font-medium ${changeColor(t.change)}`}>
                {fmtRate(t.change_rate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VolumeTable({ rows, onRowClick }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">거래대금 상위</div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-400">
            <th className="w-6"></th>
            <th className="px-3 py-2 text-left font-medium">종목</th>
            <th className="px-3 py-2 text-right font-medium">거래대금(24h)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr
              key={t.market}
              onClick={() => onRowClick(t.market)}
              className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
            >
              <td className="pl-2 pr-1 py-2.5 text-center"><CartButton market={t.market} /></td>
              <td className="px-3 py-2.5">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-800">{t.korean_name}</span>
                  <span className="text-xs text-gray-400 mt-0.5">{t.market.replace('KRW-', '')}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right text-sm font-medium text-gray-700">
                {Math.round(t.acc_trade_price_24h).toLocaleString()}<span className="text-xs font-normal text-gray-400 ml-0.5">KRW</span>
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
    <div className="bg-white border border-gray-200 rounded-md px-5 py-3.5 flex items-center gap-6">
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

export default function Market() {
  const { tickers, loading } = useTickers()
  const navigate = useNavigate()
  const { data: coinStats, loading: statsLoading } = useCoinStats()

  if (loading) return (
    <div className="py-24 flex justify-center">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )

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

  // Scatter: 거래대금 상위 N종만 대상으로, 분포 본체(IQR 펜스)만 산점도에 그리고
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

      {/* 주요 종목 (거래대금 상위) */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-2">주요 종목 · 거래대금 상위 {FEATURED_LIMIT}</div>
        <div className="grid grid-cols-4 gap-4">
          {featured.map(t => <MiniCard key={t.market} ticker={t} />)}
        </div>
      </div>

      {/* 52주 신고가/신저가 배지 */}
      <W52Badges tickers={tickers} />

      {/* 상승률 | 하락률 | 거래대금 (각 RANK_LIMIT위) */}
      <div className="grid grid-cols-3 gap-4 items-start">
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
        <VolumeTable rows={byVolume.slice(0, RANK_LIMIT)} onRowClick={goCoin} />
      </div>

      {/* 시장 현황 트리맵 (거래대금 상위 메이저) */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-700">
            거래대금 비중 지도 <span className="text-xs font-normal text-gray-400">· 거래대금 상위 {TREEMAP_LIMIT}종목</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
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

      {/* 리스크-수익 분포 (구 섹터분석에서 이식) */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 mb-1">리스크-수익 분포</div>
        <div className="text-xs text-gray-400 mb-3">거래대금 상위 {SCATTER_LIMIT}종 · X: 변동성(30일 표준편차) · Y: 1개월 수익률 · 색상: 1개월 수익률(상승 빨강/하락 파랑) · 극단값 종목은 아래 표 (호버로 종목·값)</div>
        {statsLoading ? (
          <div className="h-[360px] flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
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
            <div className="flex flex-col items-center gap-1 mt-2 text-xs text-gray-400">
              <div className="flex items-center justify-center gap-2">
                <span className="text-blue-500">하락</span>
                <span className="h-2 w-32 rounded-full" style={{ background: 'linear-gradient(to right, #3b82f6, #94a3b8, #ef4444)' }} />
                <span className="text-red-500">상승</span>
              </div>
              <span>1개월 수익률</span>
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
                        <th className="w-6"></th>
                        <th className="text-left font-medium py-1 pr-3">종목</th>
                        <th className="text-right font-medium py-1 px-3">변동성</th>
                        <th className="text-right font-medium py-1 pl-3">1개월 수익률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outliers.map(s => (
                        <tr
                          key={s.market}
                          onClick={() => goCoin(s.market)}
                          className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="pl-1 pr-1 py-1.5 text-center"><CartButton market={s.market} /></td>
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
          </>
        )}
      </div>
    </div>
  )
}
