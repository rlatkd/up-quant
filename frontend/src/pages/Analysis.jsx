import { useState, useMemo, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ScatterChart, Scatter, BarChart, Bar, LineChart, Line, ComposedChart, Area,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
  Cell, ResponsiveContainer,
} from 'recharts'
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force'
import { Card, CardHeader } from '../components/ui/Card'
import StatCard from '../components/ui/StatCard'
import Spinner from '../components/ui/Spinner'
import InfoTooltip from '../components/InfoTooltip'
import { useTickers } from '../hooks/useTickers'
import { useCoinStats } from '../hooks/useAnalysis'
import {
  usePortfolio, useNetwork, usePCA, useClusters, useDendrogram,
  useMomentum, usePairs, useRegime,
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

export function PortfolioSection({ onSend }) {
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
            <WeightCard title="★ 최대 샤프 포트폴리오" spot={data.max_sharpe} onSend={onSend} />
            <WeightCard title="◆ 최소 변동성 포트폴리오" spot={data.min_vol} onSend={onSend} />
          </div>
        </div>
      )}
    </Card>
  )
}

function WeightCard({ title, spot, onSend }) {
  // 최적 비중을 백테스트로 넘길 payload (비중은 %로 — 백테스트가 % 입력을 받음)
  const send = () => onSend({
    markets: spot.weights.map(w => w.market),
    weights: spot.weights.map(w => +(w.weight * 100).toFixed(1)),
  })
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
      {onSend && spot.weights.length > 0 && (
        <button onClick={send}
          className="w-full mt-3 px-2 py-1.5 text-[11px] font-medium bg-brand-500 text-white rounded hover:bg-brand-600 cursor-pointer transition-colors">
          이 비중으로 백테스트 →
        </button>
      )}
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

// ── 5) 모멘텀 팩터 백테스트 ───────────────────────────────────
function MomentumSection() {
  const { data, loading } = useMomentum(40, 20, 5)
  return (
    <Card>
      <CardHeader
        title={<>횡단면 모멘텀 팩터<InfoTooltip width="w-80">"최근 많이 오른 종목이 계속 오른다"는 모멘텀을 검증합니다. 매 5일마다 과거 20일 수익률 상위 20%를 <b>롱</b>, 하위 20%를 <b>숏</b>(달러중립). 동일가중 매수보유가 벤치마크입니다. 거래비용 <b>{data.fee_bps ?? 5}bps</b>(롱·숏 회전)를 차감했습니다. ⚠️ <b>인샘플·생존편향</b>(현재 상장 종목만)이 있어 실전 수익률은 더 낮습니다.</InfoTooltip></>}
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

// ── 6) 공적분 페어트레이딩 ────────────────────────────────────
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
  const { data, loading } = usePairs(50)
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

// ── 7) HMM 시장 국면 ──────────────────────────────────────────
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

// ── 8) 리스크 (변동성 분포 · 정규근사 VaR) ────────────────────
// 데이터는 전종목 coinStats(부팅 프리페치) 재사용 — 추가 팬아웃 0, 계산만.
const VAR_Z = 1.645 // 95% 단측 정규분위수
const riskColor = (vol) => lerpColor('#94a3b8', '#e0913c', vol / 12) // 일변동성 0~12%+ → 회색→앰버
const fmtKrwShort = (v) => {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + '조'
  if (v >= 1e8) return Math.round(v / 1e8).toLocaleString() + '억'
  return Math.round(v / 1e4).toLocaleString() + '만'
}

// VaR(정규근사 1일 95%) = z × 일변동성. coinStats.volatility는 30일 일간수익률 표준편차(%).
function useRiskRows() {
  const { data, loading } = useCoinStats()
  const rows = useMemo(() => (
    data
      .filter(c => c.volatility > 0)
      .map(c => ({ ...c, var95: +(VAR_Z * c.volatility).toFixed(2) }))
  ), [data])
  return { rows, loading }
}

function VolDistSection() {
  const { rows, loading } = useRiskRows()
  // 일변동성 히스토그램: 0~10%를 1%p 폭으로, 10%+ 한 칸.
  const bins = useMemo(() => {
    const out = Array.from({ length: 11 }, (_, i) => ({
      label: i < 10 ? `${i}~${i + 1}` : '10+',
      mid: i + 0.5,
      count: 0,
    }))
    rows.forEach(r => { out[Math.min(Math.floor(r.volatility), 10)].count += 1 })
    return out
  }, [rows])

  return (
    <Card>
      <CardHeader
        title={<>변동성 분포<InfoTooltip width="w-80">전 종목의 <b>30일 일간수익률 표준편차(일변동성)</b>를 1%p 구간으로 히스토그램화했습니다. 오른쪽으로 갈수록 하루 가격이 크게 출렁이는 고위험 종목 군집입니다. 색이 진할수록 고변동.</InfoTooltip></>}
        subtitle="전 종목 일변동성(30일) 히스토그램 · 진할수록 고변동"
        action={<span className="text-[11px] text-gray-400">{rows.length}종</span>}
      />
      {loading ? <Spinner /> : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={bins} margin={{ top: 10, right: 16, bottom: 16, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }}
              label={{ value: '일변동성 (%)', position: 'insideBottom', offset: -6, fontSize: 11, fill: '#9ca3af' }} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false}
              label={{ value: '종목 수', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#9ca3af' }} />
            <Tooltip contentStyle={{ fontSize: 12 }} cursor={{ fill: '#f9fafb' }}
              formatter={(v) => [v + '종', '종목 수']} labelFormatter={l => `일변동성 ${l}%`} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {bins.map((b, i) => <Cell key={i} fill={riskColor(b.mid)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

function VarRankSection() {
  const { rows, loading } = useRiskRows()
  const navigate = useNavigate()
  const ranked = useMemo(() => [...rows].sort((a, b) => b.var95 - a.var95).slice(0, 30), [rows])

  return (
    <Card>
      <CardHeader
        title={<>리스크 랭킹 (1일 95% VaR)<InfoTooltip width="w-80"><b>VaR(Value at Risk)</b>은 "95% 확률로 하루 손실이 이 값을 넘지 않는다"는 위험 척도입니다. 정규분포를 가정해 <b>1.645 × 일변동성</b>으로 근사했습니다. 값이 클수록 하루에 크게 잃을 수 있는 고위험 종목. ※ 정규근사라 실제 꼬리위험(급락)은 과소평가될 수 있습니다.</InfoTooltip></>}
        subtitle="정규근사 1일 95% VaR = 1.645 × 일변동성 · 상위 30종"
        action={<span className="text-[11px] text-gray-400">전 {rows.length}종 중</span>}
      />
      {loading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="px-3 py-2 text-left font-medium w-10">#</th>
                <th className="px-3 py-2 text-left font-medium">종목</th>
                <th className="px-3 py-2 text-right font-medium">일변동성</th>
                <th className="px-3 py-2 text-right font-medium">1일 95% VaR</th>
                <th className="px-3 py-2 text-right font-medium">1개월 수익률</th>
                <th className="px-3 py-2 text-right font-medium">24h 거래대금</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.market} onClick={() => navigate(`/coins/${r.market}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {sym(r.market)} <span className="text-gray-400 font-normal">{r.korean_name}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{r.volatility.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-500">−{r.var95.toFixed(2)}%</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${up(r.return_1m)}`}>{pct(r.return_1m)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtKrwShort(r.acc_trade_price_24h)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function RiskReturnScatterSection() {
  const { rows, loading } = useRiskRows()
  const navigate = useNavigate()
  // 분포 본체만 보이도록 거래대금 상위 120종으로 한정(잡코인 극단치가 축을 늘리는 것 방지).
  const points = useMemo(() => (
    [...rows]
      .sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h)
      .slice(0, 120)
      .map(r => ({ ...r, x: r.volatility, y: r.return_1m }))
  ), [rows])

  return (
    <Card>
      <CardHeader
        title={<>리스크-수익 분포<InfoTooltip width="w-80">거래대금 상위 120종을 <b>일변동성(X)</b> × <b>1개월 수익률(Y)</b> 평면에 흩뿌립니다. 오른쪽=고위험, 위=고수익. 왼쪽 위(저위험·고수익)가 효율적이고, 오른쪽 아래(고위험·손실)는 비효율적입니다. 점 색 = 1개월 수익률.</InfoTooltip></>}
        subtitle="일변동성 × 1개월 수익률 · 색 = 수익률 · 점 클릭 → 상세"
        action={<span className="text-[11px] text-gray-400">상위 120종</span>}
      />
      {loading ? <Spinner /> : (
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 16, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <ReferenceLine y={0} stroke="#e5e7eb" />
            <XAxis type="number" dataKey="x" name="변동성" unit="%" tick={{ fontSize: 11, fill: '#9ca3af' }}
              label={{ value: '일변동성 (%)', position: 'insideBottom', offset: -6, fontSize: 11, fill: '#9ca3af' }} />
            <YAxis type="number" dataKey="y" name="1개월수익률" unit="%" tick={{ fontSize: 11, fill: '#9ca3af' }} />
            <ZAxis range={[36, 36]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => payload?.[0] ? (
              <div className="bg-white border border-gray-200 rounded px-2 py-1 text-xs shadow-sm">
                <b>{sym(payload[0].payload.market)}</b> {payload[0].payload.korean_name}<br />
                변동성 {payload[0].payload.x.toFixed(2)}% · 1M {pct(payload[0].payload.y)}
              </div>
            ) : null} />
            <Scatter data={points} isAnimationActive={false} onClick={(p) => p?.market && navigate(`/coins/${p.market}`)} className="cursor-pointer">
              {points.map((p, i) => <Cell key={i} fill={p.y >= 0 ? '#ef4444' : '#3b82f6'} fillOpacity={0.55} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

// ── 분석 허브 (관찰형 — 유니버스에서 자동 계산해 "보여주는" 분석) ──
// 인풋(종목/전략 선택)이 필요한 설정형 도구(포트폴리오·GARCH·백테스트·비교)는 헤더 "도구"
// 드롭다운 → Tools.jsx로 분리. 여기는 시장 전체를 자동 분석해 보여주는 것만.
// 탭 상태는 URL 쿼리(?tab=)가 단일 출처.
const GROUPS = [
  {
    label: '시장 구조', tabs: [
      { id: 'network', label: '상관 네트워크', Comp: NetworkSection },
      { id: 'pca', label: 'PCA 요인', Comp: PcaSection },
      { id: 'cluster', label: '클러스터링', Comp: ClusterSection },
      { id: 'regime', label: '시장 국면', Comp: RegimeSection },
    ],
  },
  {
    label: '팩터 분석', tabs: [
      { id: 'momentum', label: '모멘텀 팩터', Comp: MomentumSection },
      { id: 'pairs', label: '페어트레이딩', Comp: PairsSection },
    ],
  },
  {
    label: '리스크', tabs: [
      { id: 'riskreturn', label: '리스크-수익 분포', Comp: RiskReturnScatterSection },
      { id: 'voldist', label: '변동성 분포', Comp: VolDistSection },
      { id: 'varrank', label: 'VaR 랭킹', Comp: VarRankSection },
    ],
  },
]
// 경로(/structure · /factor)가 어떤 그룹을 보여줄지 결정. 헤더 탭 2개와 1:1.
const PAGE_META = {
  structure: {
    group: '시장 구조',
    title: '시장 구조',
    description: '시장 전체를 자동 분석해 보여주는 인사이트 — 상관 네트워크·PCA 요인·클러스터링·시장 국면',
  },
  factor: {
    group: '팩터 분석',
    title: '팩터 분석',
    description: '시장 전체에서 팩터가 실재하는지 관찰 — 횡단면 모멘텀·공적분 페어 (고정 파라미터의 관찰형. 종목을 골라 돌리는 것은 \'전략 도구\'에서)',
  },
  risk: {
    group: '리스크',
    title: '리스크',
    description: '전 종목의 위험을 한눈에 — 일변동성 분포와 정규근사 1일 95% VaR 랭킹 (꼬리위험은 과소평가될 수 있는 정규근사)',
  },
}

// 페이지 맨 위 "한눈 요약" 스트립 — 아래 상세 차트들의 핵심 결론만 먼저 보여준다(요약→상세).
// 데이터는 아래 섹션과 같은 훅(캐시 공유)이라 추가 팬아웃 없음.
function StructureSummary() {
  const { data: pca } = usePCA(50)
  const { data: net } = useNetwork(50)
  const { data: reg } = useRegime(2)
  const hub = net.nodes.length ? net.nodes.reduce((a, b) => (b.degree > a.degree ? b : a)) : null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatCard label="시장 동조도 · PC1 설명비율" value={(pca.pc1_explained || 0) + '%'} color="text-brand-600" valueClass="text-2xl" />
      <StatCard label="네트워크 허브 (최다 연결)" value={hub ? sym(hub.market) : '—'}
        sub={hub ? `${hub.korean_name} · 연결 ${hub.degree}개` : ''} valueClass="text-2xl" />
      <StatCard label="현재 시장 국면 (HMM)" value={reg.current_label || '—'} valueClass="text-2xl" />
    </div>
  )
}

function FactorSummary() {
  const { data: mom } = useMomentum(40, 20, 5)
  const { data: pairs } = usePairs(50)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatCard label="모멘텀 팩터 총수익률" value={pct(mom.total_return)} color={up(mom.total_return)} valueClass="text-2xl" />
      <StatCard label="동일가중 벤치마크" value={pct(mom.benchmark_return)} color={up(mom.benchmark_return)} valueClass="text-2xl" />
      <StatCard label="공적분 페어 발견" value={pairs.found + '쌍'} sub={`${pairs.tested}쌍 검정 중`} valueClass="text-2xl" />
    </div>
  )
}

function RiskSummary() {
  const { rows } = useRiskRows()
  const { avgVol, avgVar, top } = useMemo(() => {
    if (!rows.length) return { avgVol: 0, avgVar: 0, top: null }
    const sum = rows.reduce((s, r) => s + r.volatility, 0)
    const mean = sum / rows.length
    return { avgVol: mean, avgVar: mean * VAR_Z, top: rows.reduce((a, b) => (b.volatility > a.volatility ? b : a)) }
  }, [rows])
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatCard label="시장 평균 일변동성" value={avgVol.toFixed(2) + '%'} valueClass="text-2xl" />
      <StatCard label="평균 1일 95% VaR" value={'−' + avgVar.toFixed(2) + '%'} color="text-blue-500" valueClass="text-2xl" />
      <StatCard label="최고 변동성 종목" value={top ? sym(top.market) : '—'}
        sub={top ? `${top.korean_name} · 일변동성 ${top.volatility.toFixed(1)}%` : ''} valueClass="text-2xl" />
    </div>
  )
}

export default function Analysis() {
  const { pathname, hash } = useLocation()
  const seg = pathname.startsWith('/factor') ? 'factor'
    : pathname.startsWith('/risk') ? 'risk' : 'structure'
  const meta = PAGE_META[seg]
  const group = GROUPS.find(g => g.label === meta.group) ?? GROUPS[0]
  const Summary = seg === 'factor' ? FactorSummary : seg === 'risk' ? RiskSummary : StructureSummary

  // 크로스링크(/structure#cluster 등)로 진입 시 해당 섹션으로 스크롤.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, seg])

  return (
    <div className="space-y-6">
      {/* 페이지 제목은 헤더 탭 활성으로 드러나므로 본문 중복 제목(PageHeader) 생략. 바로 요약 스트립부터. */}
      <Summary />
      <section className="space-y-4">
        {group.tabs.map(t => (
          <div key={t.id} id={t.id} className="scroll-mt-20">
            <t.Comp />
          </div>
        ))}
      </section>
    </div>
  )
}
