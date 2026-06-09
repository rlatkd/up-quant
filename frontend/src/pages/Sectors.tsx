import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
import { useCategoryMonthly, useCategoryDailyCumulative, useCoinStats } from '../hooks/useAnalysis'
import { useTickers } from '../hooks/useTickers'
import PageLoading from '../components/ui/PageLoading'
import PageError from '../components/ui/PageError'
import { SERIES } from '../theme'

// 카테고리(섹터)는 업비트 데이터랩 '코인 분류'에서 받아온 가변 목록(한글)이라,
// 색상은 응답 categories 순서대로 팔레트를 매핑한다. 라벨은 섹터명(한글) 그대로 사용.
const CAT_PALETTE = SERIES
const catColor = (categories, cat) => CAT_PALETTE[Math.max(0, categories.indexOf(cat)) % CAT_PALETTE.length]

// 업비트 데이터랩 '코인 분류' 대분류 5개 섹터 설명 (스냅샷 기준 · 신규 상장은 미분류)
const CAT_DESC = {
  '스마트 컨트랙트 플랫폼': '디앱·스마트계약을 구동하는 메인넷 블록체인 (예: ETH·SOL)',
  '인프라': '오라클·확장성·상호운용 등 블록체인을 떠받치는 기반 기술',
  '디파이': '탈중앙 금융 — 탈중앙거래소·대출·스테이킹 등',
  '문화/엔터테인먼트': '게임·NFT·메타버스·콘텐츠 등 엔터테인먼트 영역',
  '밈': '커뮤니티·밈에서 출발한 토큰 (예: DOGE)',
}

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

function CorrHeatmap({ rows, categories }) {
  if (!rows.length || !categories.length) return null
  const matrix = categories.map(a =>
    categories.map(b => {
      const xs = rows.map(r => r[a])
      const ys = rows.map(r => r[b])
      return parseFloat(pearson(xs, ys).toFixed(2))
    })
  )
  // 암호화폐 섹터는 대부분 강하게 동조(0.8~0.95)해 고정 임계값으론 거의 다 같은 색이 된다.
  // → 대각선(자기 자신=1.00)을 빼고, 남은 셀의 실제 min~max 범위에 색 농도를 매핑하는
  //   "상대" 스케일. 좁게 몰린 값도 차이가 보이게 펴진다. (색=절대 강도가 아니라 이 표 안 상대 강도)
  const offDiag = []
  for (let i = 0; i < categories.length; i++)
    for (let j = 0; j < categories.length; j++)
      if (i !== j) offDiag.push(matrix[i][j])
  const lo = offDiag.length ? Math.min(...offDiag) : 0
  const hi = offDiag.length ? Math.max(...offDiag) : 1
  function cellColor(v, isDiag) {
    if (isDiag) return { bg: 'rgba(229,231,235,0.5)', text: '#9ca3af' } // 대각선: 중립 회색
    const t = hi > lo ? (v - lo) / (hi - lo) : 1   // 0=상대적으로 가장 약, 1=가장 강
    const op = 0.1 + 0.75 * t
    return { bg: `rgba(239,68,68,${op})`, text: t > 0.55 ? '#fff' : '#b91c1c' }
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-xs border-collapse">
        <thead>
          <tr>
            <th className="pb-2 pr-3 text-left text-gray-400 dark:text-gray-500 font-medium w-40"></th>
            {categories.map(c => (
              <th key={c} className="pb-2 px-2 text-center text-gray-400 dark:text-gray-500 font-medium">
                <div className="flex items-center justify-center gap-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(categories, c) }} />
                  {c}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((a, i) => (
            <tr key={a}>
              <td className="pr-3 py-1 text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(categories, a) }} />
                  {a}
                </div>
              </td>
              {categories.map((b, j) => {
                const v = matrix[i][j]
                const { bg, text } = cellColor(v, i === j)
                return (
                  <td key={b} className="py-1 px-3 text-center font-semibold rounded" style={{ backgroundColor: bg, color: text }}>
                    {v.toFixed(2)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeatmapCell({ value }) {
  const abs = Math.abs(value)
  const opacity = Math.min(0.8, 0.1 + abs * 0.035)
  const bg = value >= 0 ? `rgba(239,68,68,${opacity})` : `rgba(59,130,246,${opacity})`
  const textClass = value >= 0 ? 'text-red-700' : 'text-blue-700'
  return (
    <td className={`px-3 py-2.5 text-center text-xs font-medium rounded ${textClass}`} style={{ backgroundColor: bg }}>
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </td>
  )
}

// 섹터 클릭 시 띄우는 모달 — 소속 종목 리스트(거래대금 desc) + 행 클릭 상세 + 카트 담기.
// ESC·바깥 클릭으로 닫힘. 종목은 useCoinStats(category 포함) + useTickers(현재가) 결합.
function SectorDrilldownModal({ sector, onClose, stats, tickers }) {
  const navigate = useNavigate()

  // ESC로 닫기
  useEffect(() => {
    if (!sector) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sector, onClose])

  const rows = useMemo(() => {
    if (!sector) return []
    const tickerByMarket = Object.fromEntries(tickers.map(t => [t.market, t]))
    return stats
      .filter(s => s.category === sector)
      .map(s => ({ ...s, ticker: tickerByMarket[s.market] }))
      .filter(s => s.ticker)
      .sort((a, b) => b.ticker.acc_trade_price_24h - a.ticker.acc_trade_price_24h)
  }, [sector, stats, tickers])

  if (!sector) return null

  const avgReturn = rows.length
    ? rows.reduce((s, r) => s + r.return_1m, 0) / rows.length
    : 0
  const totalVolume = rows.reduce((s, r) => s + r.ticker.acc_trade_price_24h, 0)

  const goCoin = (m) => { onClose(); navigate(`/coins/${m}`) }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" />
      <div
        className="relative bg-white dark:bg-[#1a2234] rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-[#232d40] flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-gray-800 dark:text-gray-100">{sector}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {rows.length}종 · 1개월 평균 수익률
              <span className={`ml-1 font-medium ${avgReturn > 0 ? 'text-red-500' : avgReturn < 0 ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`}>
                {avgReturn > 0 ? '+' : ''}{avgReturn.toFixed(2)}%
              </span>
              <span className="text-gray-300 mx-1.5">·</span>
              24h 총 거래대금 {Math.round(totalVolume / 1e8).toLocaleString()}억 KRW
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 text-2xl leading-none cursor-pointer">×</button>
        </div>

        {/* 종목 표 */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400 dark:text-gray-500">소속 종목 없음</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-[#141b29] border-b border-gray-100 dark:border-[#232d40] text-xs text-gray-400 dark:text-gray-500 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">종목</th>
                  <th className="px-3 py-2 text-right font-medium">현재가</th>
                  <th className="px-3 py-2 text-right font-medium">전일대비</th>
                  <th className="px-3 py-2 text-right font-medium">1개월</th>
                  <th className="px-3 py-2 text-right font-medium">거래대금(24h)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const t = r.ticker
                  const cChange = t.change === 'RISE' ? 'text-red-500' : t.change === 'FALL' ? 'text-blue-500' : 'text-gray-600 dark:text-gray-300'
                  const c1m = r.return_1m > 0 ? 'text-red-500' : r.return_1m < 0 ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'
                  return (
                    <tr
                      key={r.market}
                      onClick={() => goCoin(r.market)}
                      className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800 dark:text-gray-100">{r.market.replace('KRW-', '')}</div>
                        <div className="text-[11px] text-gray-400 dark:text-gray-500">{r.korean_name}</div>
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${cChange}`}>
                        {t.trade_price.toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${cChange}`}>
                        {(t.change_rate > 0 ? '+' : '') + (t.change_rate * 100).toFixed(2)}%
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${c1m}`}>
                        {(r.return_1m > 0 ? '+' : '') + r.return_1m.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 tabular-nums">
                        {Math.round(t.acc_trade_price_24h / 1e8).toLocaleString()}억
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// 카테고리별 누적 수익률 라인 차트 (일봉 동일가중 지수, 최근 ~200일).
// 데이터가 일 단위로 촘촘해, 대시보드 시장 종합 추세처럼 recharts 표준 Tooltip + activeDot를 쓴다.
// (과거 월봉 12점이라 점 사이를 픽셀 보간하던 커스텀 호버를 제거 — 실제 데이터 점 값만 정직하게 표시)
const CUM_BASE_H = 380       // 기본 높이(px) — 세로로 크게(라인 간격 확보)
const CUM_ZOOM_STEP = 0.5
const CUM_ZOOM_MAX = 3

// 표준 Tooltip 내용 — 호버 시점의 전 섹터 값을 큰 순으로, 색점과 함께.
function CumTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null
  const date = new Date(label * 1000).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
  const items = [...payload].sort((a, b) => b.value - a.value)
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded shadow-sm px-2.5 py-2 w-[150px]">
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">{date}</div>
      {items.map(it => (
        <div key={it.dataKey} className="flex items-center justify-between gap-2 text-xs leading-5">
          <span className="flex items-center gap-1 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: it.color }} />
            <span className="truncate text-gray-600 dark:text-gray-300">{it.dataKey}</span>
          </span>
          <span className="font-medium text-gray-800 dark:text-gray-100 flex-shrink-0">{it.value.toFixed(2)}%</span>
        </div>
      ))}
    </div>
  )
}

function CumulativeChart({ rows, categories }) {
  const [zoom, setZoom] = useState(1)      // 세로 확대 배율(가로는 항상 100%)
  const n = rows.length
  const chartH = Math.round(CUM_BASE_H * zoom)

  // x축 눈금 — 일봉 ~150점이라 약 8개만 노출(타임스탬프 기준)
  const step = Math.max(1, Math.floor(n / 8))
  const ticks = rows.filter((_, i) => i % step === 0).map(r => r.t)

  return (
    <div>
      {/* 세로 확대 컨트롤 (가로 폭은 100% 고정, 높이만 키워 라인 간격을 벌림) */}
      <div className="flex items-center justify-end gap-1.5 mb-1 text-xs text-gray-500 dark:text-gray-400">
        <span>세로 확대</span>
        <button
          type="button"
          onClick={() => setZoom(z => Math.max(1, +(z - CUM_ZOOM_STEP).toFixed(1)))}
          disabled={zoom <= 1}
          className="w-6 h-6 rounded border border-gray-200 dark:border-[#2c3850] text-gray-600 dark:text-gray-300 leading-none cursor-pointer hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >−</button>
        <span className="w-8 text-center tabular-nums text-gray-600 dark:text-gray-300">{zoom.toFixed(1)}x</span>
        <button
          type="button"
          onClick={() => setZoom(z => Math.min(CUM_ZOOM_MAX, +(z + CUM_ZOOM_STEP).toFixed(1)))}
          disabled={zoom >= CUM_ZOOM_MAX}
          className="w-6 h-6 rounded border border-gray-200 dark:border-[#2c3850] text-gray-600 dark:text-gray-300 leading-none cursor-pointer hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >+</button>
      </div>
      <ResponsiveContainer width="100%" height={chartH}>
        <LineChart data={rows} margin={{ top: 4, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
            ticks={ticks}
            tickFormatter={t => new Date(t * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
          />
          <YAxis
            width={48}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickFormatter={v => v + '%'}
            // 하단은 데이터에 맞춰 동적(5단위, 헤드룸). 상단은 기본 50% 보장하되 데이터가 넘으면 확장
            // (Compare Y축과 동일: 고정이 아니라 "기본 범위 보장 + 극단 확장"이라 강세장에서 안 잘림).
            domain={[
              (dmin) => Math.floor((Math.min(0, dmin) * 1.15 - 2) / 5) * 5,
              (dmax) => Math.max(50, Math.ceil((dmax * 1.15 + 2) / 5) * 5),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
          <Tooltip content={<CumTooltip />} />
          {categories.map(cat => (
            <Line
              key={cat}
              type="monotone"
              dataKey={cat}
              stroke={catColor(categories, cat)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Sectors() {
  const [activeSector, setActiveSector] = useState(null)  // 모달용 — 클릭된 섹터명
  const { data: monthly, loading: monthlyLoading, error: monthlyError, retry: monthlyRetry } = useCategoryMonthly()
  const { data: cumulative, loading: cumLoading, error: cumError, retry: cumRetry } = useCategoryDailyCumulative()
  // 드릴다운 모달에서 쓸 데이터 — coinStats(category 포함) + tickers(현재가). 게이트 판정에도 포함.
  const statsH = useCoinStats()
  const tickersH = useTickers()
  const coinStats = statsH.data, tickers = tickersH.tickers

  // 하나라도 로딩/에러면 헤더·푸터만 남기고 전체를 로딩/에러 페이지로(다른 컴포넌트 비노출).
  if (monthlyError || cumError || statsH.error || tickersH.error)
    return <PageError onRetry={() => { monthlyRetry(); cumRetry(); statsH.retry?.(); tickersH.retry?.() }} />
  if (monthlyLoading || cumLoading || statsH.loading || tickersH.loading) return <PageLoading />

  return (
    <div className="space-y-4">

      {/* Category descriptions — 클릭 시 소속 종목 드릴다운 모달 */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">섹터 안내</div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          업비트 데이터랩 '코인 분류' 대분류 기준 · <span className="text-brand-500">섹터를 클릭</span>하면 소속 종목 리스트를 봅니다
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
          {monthly.categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveSector(cat)}
              className="flex items-start gap-2 text-left p-2 -m-2 rounded-md hover:bg-gray-50 cursor-pointer transition-colors group"
            >
              <div className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(monthly.categories, cat) }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-brand-600 transition-colors">
                  {cat}
                  <span className="ml-1.5 text-[11px] text-gray-300 group-hover:text-brand-400">→</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{CAT_DESC[cat] ?? '—'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Cumulative returns */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">카테고리별 누적 수익률</div>
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">최근 약 200일 시작일 대비 누적 등락률 (%) · 섹터 소속 종목 동일가중 일봉 지수</div>
        {cumLoading ? (
          <div className="h-[220px] flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 dark:border-[#2c3850] border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : (
          <CumulativeChart rows={cumulative.rows} categories={cumulative.categories} />
        )}
      </div>

      {/* Monthly heatmap */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">월별 카테고리 수익률</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">각 섹터 소속 종목의 해당 월 평균 등락률 (%)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-xs text-gray-400 dark:text-gray-500 font-medium pb-2 pr-3 w-40">카테고리</th>
                  {monthly.rows.map(row => (
                    <th key={row.label} className="text-center text-xs text-gray-400 dark:text-gray-500 font-medium pb-2 px-1">
                      {row.label.slice(2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly.categories.map(cat => (
                  <tr key={cat}>
                    <td className="text-xs font-medium text-gray-600 dark:text-gray-300 py-1 pr-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(monthly.categories, cat) }} />
                        {cat}
                      </div>
                    </td>
                    {monthly.rows.map(row => (
                      <HeatmapCell key={row.label} value={row[cat]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      {/* 카테고리 상관관계 히트맵 (월별 수익률로 계산한 파생이라 월별 다음에 배치) */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">카테고리 상관관계</div>
          <Link to="/structure#network" className="text-xs text-brand-600 hover:underline">종목 단위 상관 네트워크 →</Link>
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">최근 6개월 섹터 수익률 기반 피어슨 상관계수 (-1 ~ +1) · 색은 표 안에서의 상대 강도 · 종목 단위는 분석 → 상관 네트워크</div>
        <CorrHeatmap rows={monthly.rows} categories={monthly.categories} />
      </div>

      {/* 섹터 드릴다운 모달 — activeSector 있을 때만 렌더 */}
      <SectorDrilldownModal
        sector={activeSector}
        onClose={() => setActiveSector(null)}
        stats={coinStats}
        tickers={tickers}
      />
    </div>
  )
}
