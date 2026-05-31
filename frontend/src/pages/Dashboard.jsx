import { Link, useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, AreaChart, Area, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useTickers } from '../hooks/useTickers'
import { useCategoryMonthly, useCoinStats } from '../hooks/useAnalysis'
import { DOM_COLORS } from '../theme'
import CartButton from '../components/CartButton'

const DOM_MAJORS = ['KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL']
const PRICE_TABLE_N = 10    // 시세 표(거래대금 상위) 행 수
const MOVERS_N = 23         // 급등·급락 각 목록 개수 — 시세 표 10행 높이를 채우도록(행 높이 차이 보정)
const W52_SCAN = 30         // 52주 경신 집계 대상 = 거래대금 상위 N (마켓 현황과 동일 기준)

const fmtRate = r => (r > 0 ? '+' : '') + (r * 100).toFixed(2) + '%'
const changeColor = c => (c === 'RISE' ? 'text-red-500' : c === 'FALL' ? 'text-blue-500' : 'text-gray-600')

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
    <div className="inline-flex items-stretch border border-gray-200 rounded-md overflow-hidden hover:border-brand-300 transition-colors">
      <button
        type="button"
        onClick={() => navigate(`/coins/${market}`)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer hover:bg-gray-50 transition-colors"
        title={korean_name}
      >
        <span className="font-semibold text-gray-700">{market.replace('KRW-', '')}</span>
        {value != null && <span className={`tabular-nums font-medium ${valueColor || ''}`}>{value}</span>}
      </button>
      <div className="flex items-center border-l border-gray-200 bg-gray-50">
        <CartButton market={market} />
      </div>
    </div>
  )
}

function SignalCard({ title, hint, accent, children, count, link, linkLabel }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4 flex flex-col min-h-[180px]">
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <span className={`inline-block w-1 h-4 rounded-sm ${accent}`} />
          {title}
          {count != null && count > 0 && (
            <span className="text-xs text-gray-400 font-normal">({count})</span>
          )}
        </div>
        {link && (
          <Link to={link} className="text-[11px] text-brand-600 hover:underline">{linkLabel} →</Link>
        )}
      </div>
      <div className="text-[11px] text-gray-400 mb-2.5">{hint}</div>
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
    <div className="bg-white border border-gray-200 rounded-md p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-base font-semibold text-gray-800">오늘의 시그널</div>
          <div className="text-xs text-gray-400 mt-0.5">{todayStr} · 시장에 새로 생긴 변화 — 종목 칩 클릭으로 상세, + 버튼으로 분석 카트에 담기</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

        {/* 1. 52주 새 경신 */}
        <SignalCard
          title="52주 신고/신저 경신"
          hint={`거래대금 상위 ${OPPORTUNITY_MAJORS_N}종 중 오늘 경신`}
          accent="bg-red-400"
          count={newHighs.length + newLows.length}
          link="/market" linkLabel="마켓 현황"
        >
          {newHighs.length === 0 && newLows.length === 0 ? (
            <div className="text-xs text-gray-400 py-3">오늘 새로 경신한 메이저 종목 없음</div>
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
            <div className="text-xs text-gray-400 py-3">오늘 급등 종목 없음</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {gainers.map(t => (
                <StockChip key={t.market} market={t.market} korean_name={t.korean_name}
                  value={`+${(t.change_rate * 100).toFixed(1)}%`} valueColor="text-red-500" navigate={navigate} />
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
            <div className="text-xs text-gray-400 py-3">조건 만족 종목 없음</div>
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
            <div className="text-xs text-gray-400 py-3">섹터 데이터 없음</div>
          ) : (
            <div className="space-y-1.5">
              {sectorRot.map(s => {
                const up = s.delta >= 0
                return (
                  <Link key={s.cat} to="/sectors" className="flex items-center justify-between gap-2 text-xs hover:bg-gray-50 rounded px-1.5 py-1 transition-colors">
                    <span className="text-gray-700 truncate">{s.cat}</span>
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

function KpiCard({ label, value, sub, color, valueClass = 'text-2xl' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md px-5 py-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`${valueClass} font-bold ${color || 'text-gray-800'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

// 미니 스파크라인 (시세 표 1일 추세, 0 기준 X로 변동 가시화)
function MiniSpark({ ticker, width = 72, height = 28 }) {
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
        {/* 작은 차트라 커서 툴팁이 그래프를 덮으므로 위쪽 바깥에 고정 (코인목록 스파크라인과 동일) */}
        <Tooltip
          allowEscapeViewBox={{ x: true, y: true }}
          position={{ x: 0, y: -26 }}
          wrapperStyle={{ pointerEvents: 'none', zIndex: 20 }}
          contentStyle={{ fontSize: 11, padding: '1px 6px', lineHeight: 1.3 }}
          formatter={(v) => v.toLocaleString() + ' KRW'}
          labelFormatter={() => ''}
        />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#dg-${ticker.market})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// 시세 표 — 거래대금 상위 N종 (메인 데이터 덩어리). 행 클릭 시 상세로.
function PriceTable({ tickers }) {
  const navigate = useNavigate()
  const rows = [...tickers].sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, PRICE_TABLE_N)
  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700">
          시세 <span className="text-xs font-normal text-gray-400">· 거래대금 상위 {PRICE_TABLE_N}</span>
        </div>
        <Link to="/coins" className="text-xs text-brand-600 hover:underline">코인 목록 →</Link>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-400">
            <th className="px-3 py-2 text-right font-medium w-9">#</th>
            <th className="w-6"></th>
            <th className="px-3 py-2 text-left font-medium">코인</th>
            <th className="px-3 py-2 text-right font-medium">현재가</th>
            <th className="px-3 py-2 text-right font-medium">24h</th>
            <th className="px-3 py-2 text-center font-medium w-24">추세(1일)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr
              key={t.market}
              onClick={() => navigate(`/coins/${t.market}`)}
              className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
            >
              <td className="px-3 py-2.5 text-right text-xs text-gray-400 tabular-nums">{i + 1}</td>
              <td className="pl-1 pr-1 py-2.5 text-center"><CartButton market={t.market} /></td>
              <td className="px-3 py-2.5">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-800">{t.korean_name}</span>
                  <span className="text-[11px] text-gray-400">{t.market.replace('KRW-', '')}</span>
                </div>
              </td>
              <td className={`px-3 py-2.5 text-right text-sm font-medium ${changeColor(t.change)}`}>
                {t.trade_price.toLocaleString()}
              </td>
              <td className={`px-3 py-2.5 text-right text-sm font-medium ${changeColor(t.change)}`}>
                {fmtRate(t.change_rate)}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex justify-center"><MiniSpark ticker={t} /></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
              <span className="text-xs text-gray-500">{d.name}</span>
            </div>
            <span className="text-xs font-medium text-gray-700">
              {total ? (d.value / total * 100).toFixed(1) : '0'}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MoversFeed({ tickers, count = 5 }) {
  const sorted = [...tickers].sort((a, b) => b.change_rate - a.change_rate)
  const gainers = sorted.slice(0, count)
  const losers = sorted.slice(-count).reverse()

  return (
    <div className="flex gap-4 flex-1">
      <div className="flex-1">
        <div className="text-xs font-semibold text-red-500 mb-2.5">급등</div>
        <div className="space-y-2">
          {gainers.map(t => (
            <div key={t.market} className="flex justify-between items-center">
              <span className="text-xs text-gray-700 truncate">{t.korean_name}</span>
              <span className="text-xs font-medium text-red-500 ml-2 flex-shrink-0">
                +{(t.change_rate * 100).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="w-px bg-gray-100" />
      <div className="flex-1">
        <div className="text-xs font-semibold text-blue-500 mb-2.5">급락</div>
        <div className="space-y-2">
          {losers.map(t => (
            <div key={t.market} className="flex justify-between items-center">
              <span className="text-xs text-gray-700 truncate">{t.korean_name}</span>
              <span className="text-xs font-medium text-blue-500 ml-2 flex-shrink-0">
                {(t.change_rate * 100).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// 이번 달 섹터 성과 — 최신 월 섹터별 평균 등락률을 강(빨강)·약(파랑) 바로
function SectorPerf({ monthly }) {
  const { rows, categories } = monthly
  if (!rows.length) return <div className="text-xs text-gray-400">데이터 없음</div>
  const last = rows[rows.length - 1]
  const perf = categories.map(cat => ({ cat, value: last[cat] ?? 0 })).sort((a, b) => b.value - a.value)
  const maxAbs = Math.max(1, ...perf.map(p => Math.abs(p.value)))
  return (
    <>
      <div className="text-xs text-gray-400 mb-3">{last.label} · 섹터별 평균 등락률</div>
      <div className="space-y-4">
        {perf.map(p => {
          const pos = p.value >= 0
          return (
            <div key={p.cat} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate text-gray-600 flex-shrink-0">{p.cat}</span>
              <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${pos ? 'bg-red-400' : 'bg-blue-400'}`}
                  style={{ width: `${(Math.abs(p.value) / maxAbs) * 100}%` }}
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

// 52주 신고가/신저가 요약 — 거래대금 상위 N 안에서 오늘 경신 종목, 큰 카운트 + 대표 배지
function W52Summary({ tickers }) {
  const major = [...tickers].sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, W52_SCAN)
  const highs = major.filter(t => t.is_52w_high)
  const lows = major.filter(t => t.is_52w_low)
  return (
    <>
      <div className="text-xs text-gray-400 mb-3">거래대금 상위 {W52_SCAN}종 중 오늘 경신</div>
      <div className="grid grid-cols-2 gap-3">
        {[{ label: '신고가', list: highs, c: 'red' }, { label: '신저가', list: lows, c: 'blue' }].map(g => (
          <div key={g.label} className={`rounded-md border p-3 ${g.c === 'red' ? 'border-red-100 bg-red-50/40' : 'border-blue-100 bg-blue-50/40'}`}>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-2xl font-bold ${g.c === 'red' ? 'text-red-500' : 'text-blue-500'}`}>{g.list.length}</span>
              <span className="text-xs text-gray-400">{g.label}</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-2 min-h-[20px]">
              {g.list.length === 0
                ? <span className="text-[11px] text-gray-400">없음</span>
                : g.list.slice(0, 4).map(t => (
                  <Link key={t.market} to={`/coins/${t.market}`}>
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${g.c === 'red' ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'} transition-colors`}>
                      {t.market.replace('KRW-', '')}
                    </span>
                  </Link>
                ))
              }
              {g.list.length > 4 && <span className="text-[11px] text-gray-400 self-center">+{g.list.length - 4}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export default function Dashboard() {
  const { tickers, loading: tickersLoading } = useTickers()
  const { data: monthly, loading: monthlyLoading } = useCategoryMonthly()
  const { data: coinStats } = useCoinStats()  // Opportunity Feed의 "안정 상승 모멘텀"용

  if (tickersLoading || monthlyLoading) {
    return (
      <div className="py-24 flex justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  // KPI
  const totalVolume = tickers.reduce((s, t) => s + t.acc_trade_price_24h, 0)
  const riseCount = tickers.filter(t => t.change === 'RISE').length
  const riseRatio = tickers.length ? (riseCount / tickers.length * 100).toFixed(1) : '0'
  const btc = tickers.find(t => t.market === 'KRW-BTC')
  const btcDom = btc ? (btc.acc_trade_price_24h / totalVolume * 100).toFixed(1) : '0'
  const avgChange = tickers.length
    ? (tickers.reduce((s, t) => s + t.change_rate, 0) / tickers.length * 100)
    : 0
  const avgChangeStr = (avgChange >= 0 ? '+' : '') + avgChange.toFixed(2) + '%'

  // 공포·탐욕 지수 (상승비율 60% + 평균변화율 환산 40%)
  const riseRatioPct = tickers.length ? (riseCount / tickers.length) * 100 : 50
  const changeScore = Math.min(100, Math.max(0, avgChange * 5 + 50))
  const fearGreedScore = Math.round(riseRatioPct * 0.6 + changeScore * 0.4)

  return (
    <div className="space-y-5">
      {/* Opportunity Feed — "오늘의 시그널" 최상단 액션 트리거 */}
      <OpportunityFeed tickers={tickers} coinStats={coinStats} monthly={monthly} />

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-5">
        <KpiCard
          label="24h 총 거래대금"
          value={<span className="whitespace-nowrap">{fmtKrw(totalVolume)}<span className="text-sm font-medium text-gray-400 ml-1">KRW</span></span>}
          valueClass="text-xl"
        />
        <KpiCard
          label="상승 코인 비율"
          value={riseRatio + '%'}
          sub={`${riseCount} / ${tickers.length} 종목 상승`}
          color="text-red-500"
        />
        <KpiCard label="BTC 도미넌스" value={btcDom + '%'} sub="거래대금 기준" />
        <KpiCard
          label="시장 평균 등락률"
          value={avgChangeStr}
          color={avgChange >= 0 ? 'text-red-500' : 'text-blue-500'}
        />
      </div>

      {/* 시세 위: 이번 달 섹터 성과 | 52주 신고/신저 (각각 깊은 페이지로 드릴다운) */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-md p-5">
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-sm font-semibold text-gray-700">이번 달 섹터 성과</div>
            <Link to="/sectors" className="text-xs text-brand-600 hover:underline">섹터 분석 →</Link>
          </div>
          <SectorPerf monthly={monthly} />
        </div>
        <div className="bg-white border border-gray-200 rounded-md p-5">
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-sm font-semibold text-gray-700">52주 신고가 · 신저가</div>
            <Link to="/market" className="text-xs text-brand-600 hover:underline">마켓 현황 →</Link>
          </div>
          <W52Summary tickers={tickers} />
        </div>
      </div>

      {/* 메인: 시세 표(2/3) + 급등·급락(1/3, 시세 높이만큼 늘림) */}
      <div className="grid grid-cols-3 gap-5 items-stretch">
        <div className="col-span-2">
          <PriceTable tickers={tickers} />
        </div>
        <div className="bg-white border border-gray-200 rounded-md p-5 flex flex-col">
          <div className="text-sm font-semibold text-gray-700 mb-3">급등 · 급락</div>
          <MoversFeed tickers={tickers} count={MOVERS_N} />
        </div>
      </div>

      {/* 시세 아래: 공포·탐욕 | 시장 지배력 */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-md p-5">
          <div className="text-sm font-semibold text-gray-700 mb-0.5">공포·탐욕 지수</div>
          <div className="text-xs text-gray-400 mb-3">상승비율 · 평균등락률 기반 시장 심리</div>
          <FearGreedGauge score={fearGreedScore} />
        </div>
        <div className="bg-white border border-gray-200 rounded-md p-5">
          <div className="text-sm font-semibold text-gray-700 mb-0.5">시장 지배력</div>
          <div className="text-xs text-gray-400 mb-3">24h 거래대금 기준</div>
          <MarketDominance tickers={tickers} />
        </div>
      </div>
    </div>
  )
}
