import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  PieChart, Pie, Cell, AreaChart, Area, ComposedChart, ReferenceArea,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useTickers } from '../hooks/useTickers'
import { useCategoryMonthly, useCoinStats } from '../hooks/useAnalysis'
import { useRegime } from '../hooks/useQuant'
import { DOM_COLORS, SERIES } from '../theme'
import PageLoading from '../components/ui/PageLoading'
import PageError from '../components/ui/PageError'
import { LivePrice, LiveChangeRate } from '../components/LiveCells'

const DOM_MAJORS = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL']
const PRICE_TABLE_N = 10     // 시세 요약 미니표 행 수 (상세 전체는 코인목록 — 여기는 요약)


// 시장 국면 색 (약세→강세): 파랑→회색→빨강 (Analysis RegimeSection과 동일 팔레트)
const REGIME_COLORS = ['#3b82f6', '#94a3b8', '#fca5a5', '#ef4444']

const FG_ZONES = [
  { s1: 0,  s2: 25,  color: '#3b82f6', label: '극도 공포' },
  { s1: 25, s2: 45,  color: '#93c5fd', label: '공포' },
  { s1: 45, s2: 55,  color: '#d1d5db', label: '중립' },
  { s1: 55, s2: 75,  color: '#fca5a5', label: '탐욕' },
  { s1: 75, s2: 100, color: '#ef4444', label: '극도 탐욕' },
]

// 전체 원화 콤마 표기 (업비트 톤). 예: 1,832,456,789,012 — "KRW"는 표시부에서 작게 덧붙인다.
const fmtKrw = v => Math.round(v).toLocaleString()

// ─── Opportunity Feed ────────────────────────────────────────────
// "오늘 새로 생긴 시그널"을 4가지 카드로 묶어 사용자 동선을 시작점으로 만든다.
// (기존 KPI/도넛은 "상태 보고"라 '그래서 뭐?'가 없었음 — 시그널은 '이걸 봐라'로 능동)
// 백엔드 신규 없이 기존 데이터(tickers·coinStats·monthly)로 합성.

const OPPORTUNITY_MAJORS_N = 30  // 52주·급등급락 시그널 대상 = 거래대금 상위 N (잡코인 노이즈 제외)

// 종목 칩 — 클릭은 상세 이동, 옆 + 버튼은 카트 담기
function StockChip({ market, korean_name, value, valueColor, navigate }) {
  return (
    <button
      type="button"
      onClick={() => navigate(`/coins/${market}`)}
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-[#2c3850] cursor-pointer hover:border-brand-300 hover:bg-gray-50 transition-colors"
      title={korean_name}
    >
      <span className="font-semibold text-gray-700 dark:text-gray-200">{market.replace('KRW-', '')}</span>
      {value != null && <span className={`tabular-nums font-medium ${valueColor || ''}`}>{value}</span>}
    </button>
  )
}

function SignalCard({ title, hint, accent, children, count = null, link = null, linkLabel = null }) {
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-4 flex flex-col min-h-[180px]">
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <span className={`inline-block w-1 h-4 rounded-sm ${accent}`} />
          {title}
          {count != null && count > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({count})</span>
          )}
        </div>
        {link && (
          <Link to={link} className="text-[11px] text-brand-600 hover:underline">{linkLabel} →</Link>
        )}
      </div>
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-2.5">{hint}</div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function OpportunityFeed({ tickers, coinStats, monthly }) {
  const navigate = useNavigate()

  // 1. 52주 새 경신 (거래대금 상위 30 한정)
  const major = [...tickers].sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, OPPORTUNITY_MAJORS_N)
  const newHighs = major.filter(t => t.is_52w_high)
  const newLows  = major.filter(t => t.is_52w_low)

  // 2. 급등 시그널 (전체 중 상승률 상위, 최소 2% 이상)
  const gainers = [...tickers]
    .filter(t => t.change_rate > 0.02)
    .sort((a, b) => b.change_rate - a.change_rate)
    .slice(0, 6)

  // 2b. 거래량 급증 — 최신 일봉 거래량이 직전 7일 평균의 3배 이상(이벤트·관심 급증)
  const surge = [...coinStats]
    .filter(s => s.vol_surge >= 3)
    .sort((a, b) => b.vol_surge - a.vol_surge)
    .slice(0, 6)

  // 3. 안정 상승 모멘텀 — 1개월 수익률 양수 + 변동성 적당히 낮음 (수익/변동성 비율 상위)
  //    "변동성 1단위당 수익이 좋은" 종목 — 리스크 조정 수익률(샤프 풍) 단순화 버전
  const stable = [...coinStats]
    .filter(s => s.return_1m > 5 && s.volatility > 0 && s.volatility < 5 && s.acc_trade_price_24h > 5e9)
    .sort((a, b) => (b.return_1m / b.volatility) - (a.return_1m / a.volatility))
    .slice(0, 6)

  // 4. 섹터 로테이션 — 이번 달 vs 지난 달 평균 수익률 차이 큰 섹터 (절대값 큰 순)
  const last = monthly.rows[monthly.rows.length - 1] || {}
  const prev = monthly.rows[monthly.rows.length - 2] || {}
  const sectorRot = monthly.categories
    .map(cat => ({ cat, last: last[cat] ?? 0, prev: prev[cat] ?? 0, delta: (last[cat] ?? 0) - (prev[cat] ?? 0) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4)

  const todayStr = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })

  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-base font-semibold text-gray-800 dark:text-gray-100">오늘의 시그널</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{todayStr} · 시장에 새로 생긴 변화 — 종목 칩 클릭으로 상세, + 버튼으로 분석 카트에 담기</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">

        {/* 1. 52주 새 경신 */}
        <SignalCard
          title="52주 신고/신저 경신"
          hint={`거래대금 상위 ${OPPORTUNITY_MAJORS_N}종 중 오늘 경신`}
          accent="bg-red-400"
          count={newHighs.length + newLows.length}
          link="/market" linkLabel="마켓 현황"
        >
          {newHighs.length === 0 && newLows.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 py-3">오늘 새로 경신한 메이저 종목 없음</div>
          ) : (
            <div className="space-y-2">
              {newHighs.length > 0 && (
                <div>
                  <div className="text-[10px] text-red-500 font-semibold mb-1">▲ 신고가 {newHighs.length}</div>
                  <div className="flex flex-wrap gap-1">
                    {newHighs.slice(0, 6).map(t => (
                      <StockChip key={t.market} market={t.market} korean_name={t.korean_name}
                        value={`+${(t.change_rate * 100).toFixed(1)}%`} valueColor="text-red-500" navigate={navigate} />
                    ))}
                  </div>
                </div>
              )}
              {newLows.length > 0 && (
                <div>
                  <div className="text-[10px] text-blue-500 font-semibold mb-1">▼ 신저가 {newLows.length}</div>
                  <div className="flex flex-wrap gap-1">
                    {newLows.slice(0, 6).map(t => (
                      <StockChip key={t.market} market={t.market} korean_name={t.korean_name}
                        value={`${(t.change_rate * 100).toFixed(1)}%`} valueColor="text-blue-500" navigate={navigate} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SignalCard>

        {/* 2. 급등 (>+2%) */}
        <SignalCard
          title="급등"
          hint="전일 대비 +2% 이상 상승"
          accent="bg-red-500"
          count={gainers.length}
          link="/market" linkLabel="상승률 표"
        >
          {gainers.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 py-3">오늘 급등 종목 없음</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {gainers.map(t => (
                <StockChip key={t.market} market={t.market} korean_name={t.korean_name}
                  value={`+${(t.change_rate * 100).toFixed(1)}%`} valueColor="text-red-500" navigate={navigate} />
              ))}
            </div>
          )}
        </SignalCard>

        {/* 2b. 거래량 급증 */}
        <SignalCard
          title="거래량 급증"
          hint="최신 거래량 ≥ 7일 평균 3배"
          accent="bg-amber-500"
          count={surge.length}
          link="/screener" linkLabel="조건 스크리닝"
        >
          {surge.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 py-3">거래량 급증 종목 없음</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {surge.map(s => (
                <StockChip key={s.market} market={s.market} korean_name={s.korean_name}
                  value={`${s.vol_surge.toFixed(1)}배`} valueColor="text-amber-600" navigate={navigate} />
              ))}
            </div>
          )}
        </SignalCard>

        {/* 3. 안정 상승 모멘텀 */}
        <SignalCard
          title="안정 상승 모멘텀"
          hint="1개월 +5% 이상 · 변동성 5% 이하 (수익/변동성 비율 상위)"
          accent="bg-emerald-500"
          count={stable.length}
          link="/screener" linkLabel="조건 스크리닝"
        >
          {stable.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 py-3">조건 만족 종목 없음</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {stable.map(s => (
                <StockChip key={s.market} market={s.market} korean_name={s.korean_name}
                  value={`+${s.return_1m.toFixed(1)}%`} valueColor="text-emerald-600" navigate={navigate} />
              ))}
            </div>
          )}
        </SignalCard>

        {/* 4. 섹터 로테이션 */}
        <SignalCard
          title="섹터 로테이션"
          hint="이번 달 vs 지난 달 평균 수익률 변화 큰 섹터"
          accent="bg-violet-500"
          link="/sectors" linkLabel="섹터 분석"
        >
          {sectorRot.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 py-3">섹터 데이터 없음</div>
          ) : (
            <div className="space-y-1.5">
              {sectorRot.map(s => {
                const up = s.delta >= 0
                return (
                  <Link key={s.cat} to="/sectors" className="flex items-center justify-between gap-2 text-xs hover:bg-gray-50 rounded px-1.5 py-1 transition-colors">
                    <span className="text-gray-700 dark:text-gray-200 truncate">{s.cat}</span>
                    <span className={`tabular-nums font-medium flex items-center gap-0.5 flex-shrink-0 ${up ? 'text-red-500' : 'text-blue-500'}`}>
                      {up ? '▲' : '▼'}{Math.abs(s.delta).toFixed(1)}%p
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </SignalCard>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub = null, color = '', valueClass = 'text-2xl' }) {
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md px-5 py-4">
      <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</div>
      <div className={`${valueClass} font-bold ${color || 'text-gray-800 dark:text-gray-100'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

function FearGreedGauge({ score }) {
  const cx = 100, cy = 90, r = 65

  function arc(s1, s2) {
    const a1 = Math.PI * (1 - s1 / 100)
    const a2 = Math.PI * (1 - s2 / 100)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy - r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2)
    const y2 = cy - r * Math.sin(a2)
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
  }

  const zone = FG_ZONES.find(z => score <= z.s2) || FG_ZONES[FG_ZONES.length - 1]
  const needleAngle = Math.PI * (1 - score / 100)
  const nx = cx + (r - 18) * Math.cos(needleAngle)
  const ny = cy - (r - 18) * Math.sin(needleAngle)

  return (
    <svg width="100%" height="158" viewBox="0 0 200 144">
      {FG_ZONES.map(z => (
        <path key={z.s1} d={arc(z.s1, z.s2)} fill="none" stroke={z.color} strokeWidth={14} />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#1f2937" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4.5} fill="#1f2937" />
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize={22} fontWeight="700" fill={zone.color}>{score}</text>
      <text x={cx} y={cy + 45} textAnchor="middle" fontSize={11} fill="#9ca3af">{zone.label}</text>
    </svg>
  )
}

function MarketDominance({ tickers }) {
  const total = tickers.reduce((s, t) => s + t.acc_trade_price_24h, 0)
  const majors = DOM_MAJORS.map(m => {
    const t = tickers.find(x => x.market === m)
    return { name: m.replace('KRW-', ''), value: t ? t.acc_trade_price_24h : 0 }
  })
  const othersValue = tickers
    .filter(t => !DOM_MAJORS.includes(t.market))
    .reduce((s, t) => s + t.acc_trade_price_24h, 0)
  const data = [...majors, { name: '기타', value: othersValue }]

  return (
    <div className="flex items-center justify-center gap-6 py-2">
      <PieChart width={150} height={150}>
        <Pie
          data={data}
          cx={70} cy={70}
          innerRadius={42} outerRadius={67}
          dataKey="value"
          isAnimationActive={false}
        >
          {data.map((_, i) => <Cell key={i} fill={DOM_COLORS[i]} />)}
        </Pie>
      </PieChart>
      <div className="flex flex-col gap-2 w-[104px]">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: DOM_COLORS[i] }} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{d.name}</span>
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
              {total ? (d.value / total * 100).toFixed(1) : '0'}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// 이번 달 섹터 성과 — 최신 월 섹터별 평균 등락률을 강(빨강)·약(파랑) 바로
function SectorPerf({ monthly }) {
  const { rows, categories } = monthly
  if (!rows.length) return <div className="text-xs text-gray-400 dark:text-gray-500">데이터 없음</div>
  const last = rows[rows.length - 1]
  const perf = categories.map(cat => ({ cat, value: last[cat] ?? 0 })).sort((a, b) => b.value - a.value)
  const maxAbs = Math.max(1, ...perf.map(p => Math.abs(p.value)))
  // 막대 색은 카테고리별로 구분(섹터 페이지와 동일 규칙: 원래 categories 순서 인덱스로 팔레트 매핑).
  // 정렬 후 위치가 아니라 원래 인덱스를 써야 섹터 페이지 색과 일치한다.
  const catColor = (cat) => SERIES[Math.max(0, categories.indexOf(cat)) % SERIES.length]
  return (
    <>
      <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">{last.label} · 섹터별 평균 등락률</div>
      <div className="space-y-4">
        {perf.map(p => {
          const pos = p.value >= 0
          return (
            <div key={p.cat} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate text-gray-600 dark:text-gray-300 flex-shrink-0 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(p.cat) }} />
                <span className="truncate">{p.cat}</span>
              </span>
              <div className="flex-1 h-3 rounded-full bg-gray-100 dark:bg-[#222c3e] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(Math.abs(p.value) / maxAbs) * 100}%`, backgroundColor: catColor(p.cat) }}
                />
              </div>
              <span className={`w-12 text-right font-medium flex-shrink-0 ${pos ? 'text-red-500' : 'text-blue-500'}`}>
                {pos ? '+' : ''}{p.value.toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

// 시장 종합 추세 (focal) — 동일가중 시장지수 + HMM 평온/격동 국면 밴드. get_regime 재활용(추가 호출 0).
// data는 페이지(Dashboard)가 통짜 로딩으로 보장해 prop으로 내려준다(요소별 스피너 없음).
function MarketTrendChart({ data }) {
  const segments = useMemo(() => {
    const segs = []
    let start = 0
    for (let i = 1; i <= data.points.length; i++) {
      if (i === data.points.length || data.points[i].regime !== data.points[start].regime) {
        segs.push({ x1: data.points[start].time, x2: data.points[i - 1].time, regime: data.points[start].regime })
        start = i
      }
    }
    return segs
  }, [data.points])

  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">시장 종합 추세</div>
        {data.current_label && (
          <span className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: REGIME_COLORS[data.current_regime] + '22', color: REGIME_COLORS[data.current_regime] }}>
            현재: {data.current_label}
          </span>
        )}
      </div>
      <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        전 종목 동일가중 시장지수 · 배경 = 평온/격동 국면(HMM) · <Link to="/regime#regime" className="text-brand-600 hover:underline">자세히 →</Link>
      </div>
      <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data.points} margin={{ top: 4, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            {segments.map((s, i) => (
              <ReferenceArea key={i} x1={s.x1} x2={s.x2} fill={REGIME_COLORS[s.regime]} fillOpacity={0.12} stroke="none" />
            ))}
            <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} scale="time"
              tickFormatter={t => new Date(t * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
              tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ fontSize: 12 }} labelFormatter={t => new Date(t * 1000).toLocaleDateString('ko-KR')}
              formatter={v => [v.toFixed(1), '시장지수']} />
            <Area dataKey="index" stroke="#1763b6" strokeWidth={1.5} fill="#1763b6" fillOpacity={0.06} dot={false} isAnimationActive={false} />
          </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// 미니 스파크라인 (시세 요약 표 1일 추세, 0 기준 X로 변동 가시화)
function MiniSpark({ ticker, width = 64, height = 26 }) {
  const color = ticker.change === 'RISE' ? '#ef4444' : ticker.change === 'FALL' ? '#3b82f6' : '#94a3b8'
  const data = (ticker.sparkline || []).map(v => ({ v }))
  return (
    <ResponsiveContainer width={width} height={height}>
      <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={`dg-${ticker.market}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.15} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#dg-${ticker.market})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// 시세 요약 미니표 — 거래대금 상위 N종 요약(상세 전체는 코인목록). 행 클릭 → 상세, +로 카트.
function PriceTable({ tickers }) {
  const navigate = useNavigate()
  const rows = [...tickers].sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, PRICE_TABLE_N)
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-[#232d40] flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          시세 요약 <span className="text-xs font-normal text-gray-400 dark:text-gray-500">· 거래대금 상위 {PRICE_TABLE_N}</span>
        </div>
        <Link to="/coins" className="text-xs text-brand-600 hover:underline">전체 코인 목록 →</Link>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 dark:bg-[#141b29] text-xs text-gray-400 dark:text-gray-500">
            <th className="px-3 py-2 text-right font-medium w-9">#</th>
            <th className="px-3 py-2 text-left font-medium">코인</th>
            <th className="px-3 py-2 text-right font-medium">현재가</th>
            <th className="px-3 py-2 text-right font-medium">24h</th>
            <th className="px-3 py-2 text-center font-medium w-20">추세(1일)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={t.market} onClick={() => navigate(`/coins/${t.market}`)}
              className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer">
              <td className="px-3 py-2 text-right text-xs text-gray-400 dark:text-gray-500 tabular-nums">{i + 1}</td>
              <td className="px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.korean_name}</span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">{t.market.replace('KRW-', '')}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right text-sm">
                <LivePrice ticker={t} />
              </td>
              <td className="px-3 py-2 text-right text-sm">
                <LiveChangeRate ticker={t} />
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-center"><MiniSpark ticker={t} /></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 시장 폭(breadth) — 상승/하락/보합 종목 수 분포 막대.
function MarketBreadth({ tickers }) {
  const rise = tickers.filter(t => t.change === 'RISE').length
  const fall = tickers.filter(t => t.change === 'FALL').length
  const even = tickers.length - rise - fall
  const total = tickers.length || 1
  const seg = [
    { label: '상승', n: rise, color: '#ef4444' },
    { label: '보합', n: even, color: '#d1d5db' },
    { label: '하락', n: fall, color: '#3b82f6' },
  ]
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden mb-3">
        {seg.map(s => <div key={s.label} style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.color }} />)}
      </div>
      <div className="space-y-1.5">
        {seg.map(s => (
          <div key={s.label} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />{s.label}
            </span>
            <span className="tabular-nums text-gray-700 dark:text-gray-200 font-medium">{s.n}종 <span className="text-gray-400 dark:text-gray-500">({(s.n / total * 100).toFixed(0)}%)</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { tickers, loading: tickersLoading, error: tickersError, retry } = useTickers()
  const { data: monthly, loading: monthlyLoading } = useCategoryMonthly()
  const { data: coinStats, loading: statsLoading } = useCoinStats()  // Opportunity Feed의 "안정 상승 모멘텀"용
  const { data: regime, loading: regimeLoading } = useRegime(2)       // 시장 종합 추세(focal)

  // 핵심 데이터(시세)가 실패하면 빈 화면 대신 재시도 UI.
  if (tickersError) return <PageError onRetry={retry} />
  // 페이지가 쓰는 데이터가 모두 준비될 때까지 통짜 로딩(요소별 스피너 없음)
  if (tickersLoading || monthlyLoading || statsLoading || regimeLoading) {
    return <PageLoading />
  }

  // KPI — 다른 위젯과 겹치지 않는 지표만. (도미넌스→지배력 도넛, 상승비율→시장 폭 위젯과 중복이라 제외)
  const totalVolume = tickers.reduce((s, t) => s + t.acc_trade_price_24h, 0)
  const riseCount = tickers.filter(t => t.change === 'RISE').length
  const avgChange = tickers.length
    ? (tickers.reduce((s, t) => s + t.change_rate, 0) / tickers.length * 100)
    : 0
  const avgChangeStr = (avgChange >= 0 ? '+' : '') + avgChange.toFixed(2) + '%'
  const w52high = tickers.filter(t => t.is_52w_high).length
  const w52low = tickers.filter(t => t.is_52w_low).length
  // 거래대금 집중도 — 상위 10종이 전체 거래대금에서 차지하는 비중(시장 쏠림)
  const top10Vol = [...tickers].sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h)
    .slice(0, 10).reduce((s, t) => s + t.acc_trade_price_24h, 0)
  const concentration = totalVolume ? (top10Vol / totalVolume * 100).toFixed(1) : '0'

  // 공포·탐욕 지수 (상승비율 60% + 평균변화율 환산 40%)
  const riseRatioPct = tickers.length ? (riseCount / tickers.length) * 100 : 50
  const changeScore = Math.min(100, Math.max(0, avgChange * 5 + 50))
  const fearGreedScore = Math.round(riseRatioPct * 0.6 + changeScore * 0.4)

  return (
    <div className="space-y-5">
      {/* ① KPI — 시장 종합 숫자 요약 (전용 위젯과 중복 없는 지표) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard
          label="24h 총 거래대금"
          value={<span className="whitespace-nowrap">{fmtKrw(totalVolume)}<span className="text-sm font-medium text-gray-400 dark:text-gray-500 ml-1">KRW</span></span>}
          valueClass="text-xl"
        />
        <KpiCard
          label="시장 평균 등락률"
          value={avgChangeStr}
          color={avgChange >= 0 ? 'text-red-500' : 'text-blue-500'}
        />
        <KpiCard
          label="52주 신고 / 신저 (오늘)"
          value={<span><span className="text-red-500">{w52high}</span><span className="text-gray-300 mx-1">/</span><span className="text-blue-500">{w52low}</span></span>}
          sub="오늘 경신 종목 수"
        />
        <KpiCard label="거래대금 집중도" value={concentration + '%'} sub="상위 10종 비중" />
      </div>

      {/* ② 히어로 focal — 시장 종합 추세 (전폭·확대, 명확한 주인공) */}
      <MarketTrendChart data={regime} />

      {/* ③ 오늘의 시그널 — 액션 트리거 (전폭) */}
      <OpportunityFeed tickers={tickers} coinStats={coinStats} monthly={monthly} />

      {/* ④ 보조 지표 — 작고 균일한 4카드 (위계상 히어로보다 가벼움, 동일 규격으로 정렬) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
        <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5 flex flex-col">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-0.5">공포·탐욕 지수</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">상승비율·평균등락 기반 심리</div>
          <div className="flex-1 flex items-center justify-center"><FearGreedGauge score={fearGreedScore} /></div>
        </div>
        <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5 flex flex-col">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-0.5">시장 지배력</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">24h 거래대금 비중</div>
          <div className="flex-1 flex items-center justify-center"><MarketDominance tickers={tickers} /></div>
        </div>
        <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5 flex flex-col">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-0.5">시장 폭 (Breadth)</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">상승·하락 종목 분포</div>
          <div className="flex-1 flex flex-col justify-center"><MarketBreadth tickers={tickers} /></div>
        </div>
        <Link to="/sectors" className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5 flex flex-col hover:border-brand-300 transition-colors">
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">섹터 성과</div>
            <span className="text-xs text-brand-600 font-medium">→</span>
          </div>
          <div className="flex-1 flex flex-col justify-center"><SectorPerf monthly={monthly} /></div>
        </Link>
      </div>

      {/* ⑤ 디테일 — 시세 요약 표 (전폭, 비대칭 제거) */}
      <PriceTable tickers={tickers} />
    </div>
  )
}
