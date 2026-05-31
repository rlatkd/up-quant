import { useState, useMemo } from 'react'
import {
  ScatterChart, Scatter, BarChart, Bar, LineChart, Line, ComposedChart, Area,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
  Cell, ResponsiveContainer,
} from 'recharts'
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force'
import PageHeader from '../components/ui/PageHeader'
import { Card, CardHeader } from '../components/ui/Card'
import StatCard from '../components/ui/StatCard'
import Spinner from '../components/ui/Spinner'
import InfoTooltip from '../components/InfoTooltip'
import { useTickers } from '../hooks/useTickers'
import {
  usePortfolio, useNetwork, usePCA, useClusters, useDendrogram,
  useGarch, useMomentum, usePairs, useRegime,
} from '../hooks/useQuant'
import { SERIES } from '../theme'

// ── 공용 ──────────────────────────────────────────────────────
const SECTORS = ['스마트 컨트랙트 플랫폼', '인프라', '디파이', '문화/엔터테인먼트', '밈']
const sectorColor = (cat) => {
  const i = SECTORS.indexOf(cat)
  return i >= 0 ? SERIES[i] : '#cbd5e1'
}
const CLUSTER_COLORS = ['#4c8dd6', '#e0913c', '#27b3ab', '#d56e83', '#9b7fc7', '#4cae76', '#7d93a8', '#c0853a']
const sym = (m) => (m || '').replace('KRW-', '')
const pct = (v) => (v > 0 ? '+' : '') + (v ?? 0).toFixed(2) + '%'
const up = (v) => (v >= 0 ? 'text-red-500' : 'text-blue-500')

// hex 선형보간 (샤프 색 스케일 등)
function lerpColor(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function SectorLegend({ cats }) {
  const list = cats ?? SECTORS
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {list.map(c => (
        <span key={c} className="flex items-center gap-1 text-[11px] text-gray-500">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sectorColor(c) }} />
          {c}
        </span>
      ))}
      <span className="flex items-center gap-1 text-[11px] text-gray-400">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#cbd5e1' }} />미분류
      </span>
    </div>
  )
}

function NObs({ n, label = '관측' }) {
  return <span className="text-[11px] text-gray-400">{label} {n}일</span>
}

// ── 1) 포트폴리오 (Markowitz 효율적 경계선) ───────────────────
function CoinPicker({ selected, setSelected, max = 6 }) {
  const { tickers } = useTickers()
  const add = (m) => setSelected(prev => (prev.includes(m) || prev.length >= max ? prev : [...prev, m]))
  const remove = (m) => setSelected(prev => prev.filter(x => x !== m))
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((m, i) => (
        <span key={m} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: SERIES[i % SERIES.length] }}>
          {sym(m)}
          <button onClick={() => remove(m)} className="opacity-80 cursor-pointer">✕</button>
        </span>
      ))}
      {selected.length < max && (
        <select
          value=""
          onChange={e => e.target.value && add(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-500 cursor-pointer focus:outline-none focus:border-brand-400"
        >
          <option value="">+ 종목 추가</option>
          {tickers.filter(t => !selected.includes(t.market)).slice(0, 80).map(t => (
            <option key={t.market} value={t.market}>{sym(t.market)} · {t.korean_name}</option>
          ))}
        </select>
      )}
    </div>
  )
}

function PortfolioSection() {
  const [selected, setSelected] = useState(['KRW-BTC', 'KRW-ETH', 'KRW-XRP'])
  const { data, loading } = usePortfolio(selected)

  const sharpeRange = useMemo(() => {
    if (!data.points.length) return [0, 1]
    const ss = data.points.map(p => p.sharpe)
    return [Math.min(...ss), Math.max(...ss)]
  }, [data.points])

  return (
    <Card>
      <CardHeader
        title={<>효율적 경계선 (Markowitz)<InfoTooltip width="w-80">선택한 종목으로 만들 수 있는 1,000개 무작위 포트폴리오를 (변동성, 수익률) 평면에 흩뿌리고, scipy 최적화로 <b>샤프 최대(★)</b>·<b>최소 변동성(◆)</b> 포트폴리오를 찾습니다. 연율화 기준(×365). 무위험수익률 0 가정.</InfoTooltip></>}
        subtitle="무작위 가중 1,000 시뮬 + 해석적 최적화 · 점 색 = 샤프 비율"
        action={<NObs n={data.n_obs} />}
      />
      <div className="mb-3"><CoinPicker selected={selected} setSelected={setSelected} /></div>
      {selected.length < 2 ? (
        <div className="h-72 flex items-center justify-center text-sm text-gray-400">종목을 2개 이상 선택하세요</div>
      ) : loading ? <Spinner /> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 16, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" dataKey="vol" name="변동성" unit="%" tick={{ fontSize: 11, fill: '#9ca3af' }}
                  label={{ value: '연율 변동성 (%)', position: 'insideBottom', offset: -6, fontSize: 11, fill: '#9ca3af' }} />
                <YAxis type="number" dataKey="ret" name="수익률" unit="%" tick={{ fontSize: 11, fill: '#9ca3af' }}
                  label={{ value: '연율 수익률 (%)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ fontSize: 12 }}
                  formatter={(v, n) => [v.toFixed(2) + '%', n]} />
                <Scatter data={data.points} isAnimationActive={false}>
                  {data.points.map((p, i) => {
                    const t = sharpeRange[1] > sharpeRange[0] ? (p.sharpe - sharpeRange[0]) / (sharpeRange[1] - sharpeRange[0]) : 0.5
                    return <Cell key={i} fill={lerpColor('#94a3b8', '#e0913c', t)} fillOpacity={0.5} r={2} />
                  })}
                </Scatter>
                {/* 개별 종목 */}
                <Scatter data={data.assets} isAnimationActive={false} shape="circle" fill="#1763b6">
                  {data.assets.map((a, i) => <Cell key={i} r={5} fill={SERIES[i % SERIES.length]} />)}
                </Scatter>
                {/* 최대샤프 ★ / 최소분산 ◆ */}
                <Scatter data={[data.max_sharpe]} isAnimationActive={false} shape="star" fill="#ef4444" />
                <Scatter data={[data.min_vol]} isAnimationActive={false} shape="diamond" fill="#3b82f6" />
              </ScatterChart>
            </ResponsiveContainer>
            <div className="flex gap-4 justify-center text-[11px] text-gray-500 mt-1">
              <span>★ 최대 샤프</span><span>◆ 최소 변동성</span><span>● 개별 종목</span>
            </div>
          </div>
          <div className="space-y-3">
            <WeightCard title="★ 최대 샤프 포트폴리오" spot={data.max_sharpe} />
            <WeightCard title="◆ 최소 변동성 포트폴리오" spot={data.min_vol} />
          </div>
        </div>
      )}
    </Card>
  )
}

function WeightCard({ title, spot }) {
  return (
    <div className="border border-gray-100 rounded-md p-3">
      <div className="text-xs font-semibold text-gray-700 mb-2">{title}</div>
      <div className="flex gap-3 text-[11px] text-gray-500 mb-2">
        <span>수익률 <b className={up(spot.ret)}>{pct(spot.ret)}</b></span>
        <span>변동성 <b className="text-gray-700">{spot.vol?.toFixed(1)}%</b></span>
        <span>샤프 <b className="text-gray-700">{spot.sharpe?.toFixed(2)}</b></span>
      </div>
      <div className="space-y-1">
        {spot.weights.map((w, i) => (
          <div key={w.market} className="flex items-center gap-2">
            <span className="w-9 text-[11px] text-gray-600">{sym(w.market)}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${w.weight * 100}%`, backgroundColor: SERIES[i % SERIES.length] }} />
            </div>
            <span className="w-10 text-right text-[11px] text-gray-500 tabular-nums">{(w.weight * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 2) 상관 네트워크 (MST) ────────────────────────────────────
function NetworkSection() {
  const { data, loading } = useNetwork(50)
  const W = 760, H = 480

  // d3-force 정적 레이아웃(애니메이션 없이 N틱 수렴 후 좌표 고정).
  const laid = useMemo(() => {
    if (!data.nodes.length) return { nodes: [], edges: [] }
    const nodes = data.nodes.map(n => ({ ...n }))
    const idx = Object.fromEntries(nodes.map((n, i) => [n.market, i]))
    const links = data.edges.map(e => ({ source: idx[e.source], target: idx[e.target], corr: e.corr }))
    const sim = forceSimulation(nodes)
      .force('charge', forceManyBody().strength(-160))
      .force('link', forceLink(links).distance(d => 40 + (1 - d.corr) * 70).strength(0.4))
      .force('center', forceCenter(W / 2, H / 2))
      .force('collide', forceCollide().radius(d => 8 + d.degree * 1.6))
      .stop()
    for (let i = 0; i < 300; i++) sim.tick()
    const pad = 24
    nodes.forEach(n => {
      n.x = Math.max(pad, Math.min(W - pad, n.x))
      n.y = Math.max(pad, Math.min(H - pad, n.y))
    })
    // forceLink가 link.source/target을 노드 객체로 치환하므로 좌표를 명시적으로 해석해 반환.
    const edges = links.map(l => ({ x1: l.source.x, y1: l.source.y, x2: l.target.x, y2: l.target.y, corr: l.corr }))
    return { nodes, edges }
  }, [data])

  const maxDeg = Math.max(1, ...laid.nodes.map(n => n.degree))

  return (
    <Card>
      <CardHeader
        title={<>상관 네트워크 (최소신장트리)<InfoTooltip width="w-80">거래대금 상위 50종의 일간수익률 상관을 <b>Mantegna 거리</b> √(2(1−ρ))로 변환해 <b>최소신장트리(MST)</b>를 그립니다. 연결이 많은(degree 큰) 종목일수록 시장의 <b>중심·허브</b>입니다. 색=섹터, 크기=연결 수.</InfoTooltip></>}
        subtitle="networkx MST · 노드 크기 = 연결 수(허브), 색 = 섹터"
        action={<NObs n={data.n_obs} />}
      />
      {loading ? <Spinner /> : (
        <>
          <div className="w-full overflow-hidden">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 480 }}>
              {laid.edges.map((e, i) => (
                <line key={i}
                  x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                  stroke="#cbd5e1" strokeWidth={0.5 + e.corr * 2} strokeOpacity={0.25 + e.corr * 0.45} />
              ))}
              {laid.nodes.map((n, i) => {
                const r = 5 + n.degree * 1.8
                const isHub = n.degree >= Math.max(4, maxDeg - 1)
                return (
                  <g key={i}>
                    <circle cx={n.x} cy={n.y} r={r} fill={sectorColor(n.category)} fillOpacity={0.85} stroke="#fff" strokeWidth={1} />
                    {(isHub || r > 9) && (
                      <text x={n.x} y={n.y - r - 2} textAnchor="middle" fontSize={isHub ? 11 : 9}
                        fontWeight={isHub ? 700 : 500} fill={isHub ? '#093687' : '#64748b'}>{sym(n.market)}</text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
          <div className="mt-2"><SectorLegend /></div>
        </>
      )}
    </Card>
  )
}

// ── 3) PCA 시장 요인 ──────────────────────────────────────────
function PcaSection() {
  const { data, loading } = usePCA(50)
  const scree = data.components.slice(0, 8)
  return (
    <Card>
      <CardHeader
        title={<>PCA 시장 요인 분석<InfoTooltip width="w-80">표준화된 일간수익률에 주성분분석(PCA)을 적용. <b>제1주성분(PC1)</b>은 모든 코인을 같이 움직이게 하는 <b>공통 시장 요인</b>이고, 설명비율이 높을수록 시장이 한 덩어리로 동조화됐다는 뜻입니다. 종목별 PC1 로딩 = 시장요인 동조도(≈베타). 스테이블코인은 음수/0 부근.</InfoTooltip></>}
        subtitle="sklearn PCA · PC1 = 공통 시장 요인"
        action={<NObs n={data.n_obs} />}
      />
      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <StatCard label="제1주성분 설명비율 (시장 동조도)" value={data.pc1_explained + '%'} color="text-brand-600" valueClass="text-2xl" />
            <div className="md:col-span-2 border border-gray-100 rounded-md p-3">
              <div className="text-[11px] text-gray-400 mb-1">주성분별 설명분산 (스크리)</div>
              <ResponsiveContainer width="100%" height={88}>
                <BarChart data={scree} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <XAxis dataKey="index" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => 'PC' + v} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} unit="%" />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={v => v.toFixed(2) + '%'} labelFormatter={v => 'PC' + v} />
                  <Bar dataKey="explained" fill="#4c8dd6" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="text-[11px] text-gray-400 mb-1">종목별 로딩 (PC1 = 가로 시장동조 / PC2 = 세로 2차축)</div>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 16, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <ReferenceLine x={0} stroke="#e5e7eb" /><ReferenceLine y={0} stroke="#e5e7eb" />
              <XAxis type="number" dataKey="pc1" name="PC1" domain={[-1, 1]} tick={{ fontSize: 11, fill: '#9ca3af' }}
                label={{ value: 'PC1 (시장 동조)', position: 'insideBottom', offset: -6, fontSize: 11, fill: '#9ca3af' }} />
              <YAxis type="number" dataKey="pc2" name="PC2" domain={[-1, 1]} tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <ZAxis range={[40, 40]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ fontSize: 12 }}
                formatter={(v, n) => [v.toFixed(2), n]} labelFormatter={() => ''}
                content={({ payload }) => payload?.[0] ? (
                  <div className="bg-white border border-gray-200 rounded px-2 py-1 text-xs shadow-sm">
                    <b>{sym(payload[0].payload.market)}</b> {payload[0].payload.korean_name}<br />
                    PC1 {payload[0].payload.pc1.toFixed(2)} · PC2 {payload[0].payload.pc2.toFixed(2)}
                  </div>
                ) : null} />
              <Scatter data={data.loadings} isAnimationActive={false}>
                {data.loadings.map((l, i) => <Cell key={i} fill={sectorColor(l.category)} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div className="mt-1"><SectorLegend /></div>
        </>
      )}
    </Card>
  )
}

// ── 4) 클러스터링 (K-means + 덴드로그램) ──────────────────────
function ClusterSection() {
  const { data: km, loading: kl } = useClusters(80, 4)
  const { data: dn, loading: dl } = useDendrogram(40)
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={<>K-means 군집<InfoTooltip width="w-80">업비트 섹터(테마)와 무관하게 <b>통계적 성격</b>(30일 변동성·1개월 수익률·거래대금)으로 종목을 K=4 군집으로 묶습니다. 같은 색 = 비슷한 위험·수익·유동성 프로파일.</InfoTooltip></>}
          subtitle="sklearn KMeans · 변동성 × 수익률 (크기 = 거래대금)"
          action={<span className="text-[11px] text-gray-400">{km.n}종 · {km.k}군집</span>}
        />
        {kl ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 16, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" dataKey="volatility" name="변동성" unit="%" tick={{ fontSize: 11, fill: '#9ca3af' }}
                label={{ value: '30일 변동성 (%)', position: 'insideBottom', offset: -6, fontSize: 11, fill: '#9ca3af' }} />
              <YAxis type="number" dataKey="return_1m" name="1개월수익률" unit="%" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <ZAxis type="number" dataKey="log_value" range={[30, 260]} />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => payload?.[0] ? (
                <div className="bg-white border border-gray-200 rounded px-2 py-1 text-xs shadow-sm">
                  <b>{sym(payload[0].payload.market)}</b> · 군집 {payload[0].payload.cluster}<br />
                  변동성 {payload[0].payload.volatility}% · 1M {pct(payload[0].payload.return_1m)}
                </div>
              ) : null} />
              <Scatter data={km.points} isAnimationActive={false}>
                {km.points.map((p, i) => <Cell key={i} fill={CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]} fillOpacity={0.7} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <CardHeader
          title={<>계층적 클러스터링 (덴드로그램)<InfoTooltip width="w-80">거래대금 상위 40종의 상관 거리에 평균연결 계층 군집을 적용. 아래에서 위로 합쳐지며, <b>낮은 높이에서 묶일수록 더 비슷</b>하게 움직이는 종목입니다.</InfoTooltip></>}
          subtitle="scipy average linkage · 상관 거리 트리"
          action={<NObs n={dn.n_obs} />}
        />
        {dl ? <Spinner /> : <Dendrogram dn={dn} />}
      </Card>
    </div>
  )
}

function Dendrogram({ dn }) {
  if (!dn.icoord.length) return <div className="text-sm text-gray-400 py-8 text-center">데이터 없음</div>
  const allX = dn.icoord.flat(), allY = dn.dcoord.flat()
  const xMax = Math.max(...allX), yMax = Math.max(...allY)
  const W = Math.max(640, dn.markets.length * 22), H = 300, padB = 70, padT = 8
  const sx = (x) => (x / xMax) * (W - 20) + 10
  const sy = (y) => padT + (1 - y / yMax) * (H - padT - padB)
  const leafX = dn.markets.map((_, i) => sx(5 + i * 10))
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: W > 900 ? W : undefined, height: H }}>
        {dn.icoord.map((xs, k) => {
          const ys = dn.dcoord[k]
          const pts = xs.map((x, j) => `${sx(x)},${sy(ys[j])}`).join(' ')
          return <polyline key={k} points={pts} fill="none" stroke="#7d93a8" strokeWidth={1} />
        })}
        {dn.markets.map((m, i) => (
          <text key={m} x={leafX[i]} y={H - padB + 12} fontSize={9} fill={sectorColor(dn.categories[i])}
            transform={`rotate(-90 ${leafX[i]} ${H - padB + 12})`} textAnchor="end">{sym(m)}</text>
        ))}
      </svg>
      <div className="mt-1"><SectorLegend /></div>
    </div>
  )
}

// ── 5) GARCH 변동성 예측 ──────────────────────────────────────
function GarchSection() {
  const [market, setMarket] = useState('KRW-BTC')
  const { tickers } = useTickers()
  const { data, loading } = useGarch(market)

  const chartData = useMemo(() => {
    const hist = data.cond_vol.map(p => ({ t: p.time, vol: p.vol }))
    const lastT = hist.length ? hist[hist.length - 1].t : 0
    const fc = data.forecast_vol.map((v, i) => ({ t: lastT + (i + 1) * 86400, fc: v }))
    return [...hist.slice(-90), ...fc]
  }, [data])

  return (
    <Card>
      <CardHeader
        title={<>GARCH 변동성 예측 + VaR<InfoTooltip width="w-80">가격이 아니라 <b>변동성</b>을 예측합니다(큰 변동 뒤 큰 변동 = 변동성 군집성). arch 라이브러리로 GARCH(1,1)를 적합해 조건부 변동성과 향후 10일 예측, 1일 95% VaR(예상 최대손실)을 계산합니다.</InfoTooltip></>}
        subtitle="arch GARCH(1,1) · 일간 조건부 변동성"
        action={(
          <select value={market} onChange={e => setMarket(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 cursor-pointer focus:outline-none focus:border-brand-400">
            {tickers.slice(0, 60).map(t => <option key={t.market} value={t.market}>{sym(t.market)}</option>)}
          </select>
        )}
      />
      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard label="현재 연율 변동성" value={data.current_vol_annual + '%'} color="text-brand-600" valueClass="text-xl" />
            <StatCard label="1일 95% VaR (예상 최대손실)" value={'-' + data.var_95 + '%'} color="text-blue-500" valueClass="text-xl" />
            <StatCard label="변동성 지속성 (α+β)" value={data.persistence?.toFixed(3)} sub={data.persistence >= 0.98 ? '충격이 오래 지속' : '평균회귀'} valueClass="text-xl" />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time"
                tickFormatter={t => new Date(t * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} unit="%" />
              <Tooltip contentStyle={{ fontSize: 12 }} labelFormatter={t => new Date(t * 1000).toLocaleDateString('ko-KR')}
                formatter={(v, n) => [v?.toFixed(2) + '%', n === 'fc' ? '예측' : '조건부 변동성']} />
              <Line dataKey="vol" stroke="#1763b6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line dataKey="fc" stroke="#e0913c" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 justify-center text-[11px] text-gray-500 mt-1">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-brand-500 inline-block" />조건부 변동성</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block" style={{ background: '#e0913c' }} />향후 10일 예측</span>
          </div>
        </>
      )}
    </Card>
  )
}

// ── 6) 모멘텀 팩터 백테스트 ───────────────────────────────────
function MomentumSection() {
  const { data, loading } = useMomentum(40, 20, 5)
  return (
    <Card>
      <CardHeader
        title={<>횡단면 모멘텀 팩터<InfoTooltip width="w-80">"최근 많이 오른 종목이 계속 오른다"는 모멘텀을 검증합니다. 매 5일마다 과거 20일 수익률 상위 20%를 <b>롱</b>, 하위 20%를 <b>숏</b>(달러중립). 동일가중 매수보유가 벤치마크입니다. ※ 인샘플·거래비용 미반영.</InfoTooltip></>}
        subtitle="20일 모멘텀 · 5일 리밸런스 · 롱숏 달러중립"
        action={<span className="text-[11px] text-gray-400">{data.n}종</span>}
      />
      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="팩터 총수익률" value={pct(data.total_return)} color={up(data.total_return)} valueClass="text-xl" />
            <StatCard label="벤치마크(동일가중)" value={pct(data.benchmark_return)} color={up(data.benchmark_return)} valueClass="text-xl" />
            <StatCard label="샤프" value={data.sharpe?.toFixed(2)} valueClass="text-xl" />
            <StatCard label="최대낙폭(MDD)" value={data.mdd + '%'} color="text-blue-500" valueClass="text-xl" />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.equity} margin={{ top: 4, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} scale="time"
                tickFormatter={t => new Date(t * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ fontSize: 12 }} labelFormatter={t => new Date(t * 1000).toLocaleDateString('ko-KR')}
                formatter={(v, n) => [v.toFixed(1), n === 'factor' ? '모멘텀 팩터' : '벤치마크']} />
              <ReferenceLine y={100} stroke="#e5e7eb" />
              <Line dataKey="factor" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="benchmark" stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <HoldingList title="현재 롱 (모멘텀 상위)" rows={data.long} color="text-red-500" />
            <HoldingList title="현재 숏 (모멘텀 하위)" rows={data.short} color="text-blue-500" />
          </div>
        </>
      )}
    </Card>
  )
}

function HoldingList({ title, rows, color }) {
  return (
    <div className="border border-gray-100 rounded-md p-3">
      <div className={`text-xs font-semibold mb-2 ${color}`}>{title}</div>
      <div className="space-y-1">
        {rows.map(h => (
          <div key={h.market} className="flex justify-between text-xs">
            <span className="text-gray-700">{sym(h.market)} <span className="text-gray-400">{h.korean_name}</span></span>
            <span className={`font-medium tabular-nums ${up(h.momentum)}`}>{pct(h.momentum)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 7) 공적분 페어트레이딩 ────────────────────────────────────
function SignalBadge({ signal }) {
  const map = {
    LONG_SPREAD: ['롱 스프레드', 'bg-red-50 text-red-600'],
    SHORT_SPREAD: ['숏 스프레드', 'bg-blue-50 text-blue-600'],
    NEUTRAL: ['중립', 'bg-gray-100 text-gray-500'],
  }
  const [label, cls] = map[signal] || map.NEUTRAL
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>{label}</span>
}

function PairsSection() {
  const { data, loading } = usePairs(30)
  return (
    <Card>
      <CardHeader
        title={<>공적분 페어트레이딩<InfoTooltip width="w-80">두 코인의 로그가격이 장기적으로 같이 움직이면(<b>공적분</b>) 스프레드가 평균으로 회귀합니다. Engle-Granger 검정 p&lt;0.05 페어를 찾고, 스프레드 z점수 |z|&gt;2면 진입 신호(z↑=숏 스프레드, z↓=롱 스프레드).</InfoTooltip></>}
        subtitle="statsmodels coint + ADF · 평균회귀 페어"
        action={<span className="text-[11px] text-gray-400">{data.tested}쌍 검정 · {data.found}쌍 공적분</span>}
      />
      {loading ? <Spinner /> : data.pairs.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">공적분 페어 없음</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="px-3 py-2 text-left font-medium">페어</th>
                <th className="px-3 py-2 text-right font-medium">p값</th>
                <th className="px-3 py-2 text-right font-medium">상관</th>
                <th className="px-3 py-2 text-right font-medium">헤지비율 β</th>
                <th className="px-3 py-2 text-right font-medium">z점수</th>
                <th className="px-3 py-2 text-center font-medium">신호</th>
              </tr>
            </thead>
            <tbody>
              {data.pairs.map((p, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {sym(p.market1)} <span className="text-gray-300">↔</span> {sym(p.market2)}
                    <div className="text-[11px] text-gray-400 font-normal">{p.korean_name1} · {p.korean_name2}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{p.pvalue.toFixed(4)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{p.correlation.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{p.hedge_ratio.toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${Math.abs(p.zscore) > 2 ? 'text-gray-800' : 'text-gray-400'}`}>{p.zscore > 0 ? '+' : ''}{p.zscore.toFixed(2)}</td>
                  <td className="px-3 py-2 text-center"><SignalBadge signal={p.signal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ── 8) HMM 시장 국면 ──────────────────────────────────────────
const REGIME_COLORS = ['#3b82f6', '#94a3b8', '#fca5a5', '#ef4444'] // 약세→강세 (파랑→빨강)

function RegimeSection() {
  const { data, loading } = useRegime(2)
  // 연속 같은 국면 구간을 묶어 배경 밴드(ReferenceArea)로.
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
    <Card>
      <CardHeader
        title={<>시장 국면 탐지 (HMM)<InfoTooltip width="w-80">동일가중 시장지수의 수익률·변동성에 가우시안 <b>은닉마르코프모델(HMM)</b>을 적합해, 시장이 스스로 나눈 <b>평온/격동 국면</b>을 색 밴드로 보여줍니다. 변동성 군집성 덕에 국면이 지속됩니다.</InfoTooltip></>}
        subtitle="hmmlearn GaussianHMM · 시장지수 + 국면 밴드"
        action={(
          <span className={`px-2 py-0.5 rounded text-xs font-medium`} style={{ backgroundColor: REGIME_COLORS[data.current_regime] + '22', color: REGIME_COLORS[data.current_regime] }}>
            현재: {data.current_label}
          </span>
        )}
      />
      {loading ? <Spinner /> : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data.points} margin={{ top: 4, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              {segments.map((s, i) => (
                <ReferenceArea key={i} x1={s.x1} x2={s.x2}
                  fill={REGIME_COLORS[s.regime]} fillOpacity={0.12} stroke="none" />
              ))}
              <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} scale="time"
                tickFormatter={t => new Date(t * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ fontSize: 12 }} labelFormatter={t => new Date(t * 1000).toLocaleDateString('ko-KR')}
                formatter={v => [v.toFixed(1), '시장지수']} />
              <Area dataKey="index" stroke="#1763b6" strokeWidth={1.5} fill="#1763b6" fillOpacity={0.05} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
            {data.stats.map(s => (
              <div key={s.regime} className="border border-gray-100 rounded-md p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: REGIME_COLORS[s.regime] }} />
                  <span className="text-xs font-semibold text-gray-700">{s.label}</span>
                </div>
                <div className="text-[11px] text-gray-500">평균 {pct(s.mean_return)}/일 · 변동 {s.volatility}%</div>
                <div className="text-[11px] text-gray-400">{s.days}일 ({s.share}%)</div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

// ── 페이지 (서브탭) ───────────────────────────────────────────
const TABS = [
  { id: 'portfolio', label: '포트폴리오', Comp: PortfolioSection },
  { id: 'network', label: '상관 네트워크', Comp: NetworkSection },
  { id: 'pca', label: 'PCA 요인', Comp: PcaSection },
  { id: 'cluster', label: '클러스터링', Comp: ClusterSection },
  { id: 'garch', label: '변동성(GARCH)', Comp: GarchSection },
  { id: 'momentum', label: '모멘텀 팩터', Comp: MomentumSection },
  { id: 'pairs', label: '페어트레이딩', Comp: PairsSection },
  { id: 'regime', label: '시장 국면', Comp: RegimeSection },
]

export default function QuantLab() {
  const [tab, setTab] = useState('portfolio')
  const Active = TABS.find(t => t.id === tab).Comp
  return (
    <div className="space-y-4">
      <PageHeader
        title="퀀트 랩"
        description="포트폴리오 최적화·요인분석·클러스터링·변동성예측·팩터·페어·국면 — numpy/scipy/sklearn/statsmodels/arch/hmmlearn 기반 정량 분석"
      />
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-px">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm rounded-t font-medium cursor-pointer transition-colors ${
              tab === t.id ? 'bg-white border border-gray-200 border-b-white text-brand-600 -mb-px' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      <Active />
    </div>
  )
}
