import { useState, useMemo, useEffect, type ComponentType, type Dispatch, type SetStateAction } from 'react'
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
import PageLoading from '../components/ui/PageLoading'
import PageError from '../components/ui/PageError'
import InfoTooltip from '../components/InfoTooltip'
import Caveat from '../components/Caveat'
import { useTickers } from '../hooks/useTickers'
import { useCoinStats } from '../hooks/useAnalysis'
import {
  usePortfolio, useNetwork, usePCA, useClusters, useDendrogram,
  useMomentum, usePairs, useRegime,
} from '../hooks/useQuant'
import { SERIES } from '../theme'
import type { AssetPoint, PortfolioSpot, DendrogramResult, MomentumHolding, PairBacktestDetail } from '../types'

// ── 공용 ──────────────────────────────────────────────────────
const SECTORS = ['스마트 컨트랙트 플랫폼', '인프라', '디파이', '문화/엔터테인먼트', '밈']
const sectorColor = (cat: string) => {
  const i = SECTORS.indexOf(cat)
  return i >= 0 ? SERIES[i] : '#cbd5e1'
}
const CLUSTER_COLORS = ['#4c8dd6', '#e0913c', '#27b3ab', '#d56e83', '#9b7fc7', '#4cae76', '#7d93a8', '#c0853a']
const sym = (m: string) => (m || '').replace('KRW-', '')
const pct = (v: number) => (v > 0 ? '+' : '') + (v ?? 0).toFixed(2) + '%'
const up = (v: number) => (v >= 0 ? 'text-red-500' : 'text-blue-500')

// hex 선형보간 (샤프 색 스케일 등)
function lerpColor(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function SectorLegend({ cats = [] }: { cats?: string[] }) {
  const list = cats ?? SECTORS
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {list.map((c) => (
        <span key={c} className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sectorColor(c) }} />
          {c}
        </span>
      ))}
      <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#cbd5e1' }} />미분류
      </span>
    </div>
  )
}

function NObs({ n, label = '관측' }: { n: number; label?: string }) {
  return <span className="text-[11px] text-gray-400 dark:text-gray-500">{label} {n}일</span>
}

// ── 1) 포트폴리오 (Markowitz 효율적 경계선) ───────────────────
function CoinPicker({ selected, setSelected, max = 6 }: { selected: string[]; setSelected: Dispatch<SetStateAction<string[]>>; max?: number }) {
  const { tickers } = useTickers()
  const add = (m: any) => setSelected((prev) => (prev.includes(m) || prev.length >= max ? prev : [...prev, m]))
  const remove = (m: any) => setSelected((prev) => prev.filter((x) => x !== m))
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
          className="border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer focus:outline-none focus:border-brand-400"
        >
          <option value="">+ 종목 추가</option>
          {tickers.filter((t) => !selected.includes(t.market)).slice(0, 80).map((t) => (
            <option key={t.market} value={t.market}>{sym(t.market)} · {t.korean_name}</option>
          ))}
        </select>
      )}
    </div>
  )
}

export function PortfolioSection({ onSend }: { onSend: (payload: any) => void }) {
  const [selected, setSelected] = useState(['KRW-BTC', 'KRW-ETH', 'KRW-XRP'])
  const { data, loading } = usePortfolio(selected)
  const [fIdx, setFIdx] = useState(-1)   // 목표수익률 슬라이더 인덱스 (-1=기본=최대샤프 근처)

  const sharpeRange = useMemo(() => {
    if (!data.points.length) return [0, 1]
    const ss = data.points.map((p: any) => p.sharpe)
    return [Math.min(...ss), Math.max(...ss)]
  }, [data.points])

  // 슬라이더 기본 인덱스 — 최대샤프에 가장 가까운 경계선 점.
  const defaultIdx = useMemo(() => {
    if (!data.frontier.length) return -1
    const t = data.max_sharpe?.ret
    if (t == null) return Math.floor(data.frontier.length / 2)
    let best = 0, bd = Infinity
    data.frontier.forEach((p: any, i: any) => { const d = Math.abs(p.ret - t); if (d < bd) { bd = d; best = i } })
    return best
  }, [data])
  const idx = (fIdx >= 0 && fIdx < data.frontier.length) ? fIdx : defaultIdx
  const fp = idx >= 0 ? data.frontier[idx] : null

  // 자본배분선(CAL) — 무위험수익률 0에서 최대샤프(접점) 포트폴리오로 긋는 직선. 기울기=샤프.
  const cal = useMemo(() => {
    const ms = data.max_sharpe
    if (!ms || !ms.vol) return []
    const maxVol = Math.max(ms.vol, ...data.assets.map((a: any) => a.vol)) * 1.05
    const slope = ms.ret / ms.vol
    return [{ vol: 0, ret: 0 }, { vol: maxVol, ret: slope * maxVol }]
  }, [data])

  return (
    <Card>
      <CardHeader
        title={<>효율적 경계선 (Markowitz)<InfoTooltip width="w-80">선택한 종목으로 만들 수 있는 1,000개 무작위 포트폴리오를 (변동성, 수익률) 평면에 흩뿌리고, 목표수익률별 최소분산 최적화로 <b>효율적 경계선 곡선</b>을 그립니다. <b>자본배분선(CAL)</b>은 무위험수익률 0에서 <b>접점(최대샤프★) 포트폴리오</b>로 긋는 직선입니다. 곡선이 개별 종목보다 왼쪽(낮은 변동성)에 있으면 분산효과가 있는 것입니다. 연율화 기준(×365).</InfoTooltip></>}
        subtitle="효율적 경계선 + 자본배분선(CAL) · 무작위 1,000 시뮬 · 점 색 = 샤프"
        action={<NObs n={data.n_obs} />}
      />
      <div className="mb-3"><CoinPicker selected={selected} setSelected={setSelected} /></div>
      {selected.length < 2 ? (
        <div className="h-72 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">종목을 2개 이상 선택하세요</div>
      ) : loading ? <Spinner /> : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <div className="lg:col-span-2 flex flex-col">
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 16, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" dataKey="vol" name="변동성" unit="%" tick={{ fontSize: 11, fill: '#9ca3af' }}
                  label={{ value: '연율 변동성 (%)', position: 'insideBottom', offset: -6, fontSize: 11, fill: '#9ca3af' }} />
                <YAxis type="number" dataKey="ret" name="수익률" unit="%" tick={{ fontSize: 11, fill: '#9ca3af' }}
                  label={{ value: '연율 수익률 (%)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ fontSize: 12 }}
                  formatter={(v: any, n: any) => [v.toFixed(2) + '%', n]} />
                <Scatter data={data.points} isAnimationActive={false}>
                  {data.points.map((p: any, i: any) => {
                    const t = sharpeRange[1] > sharpeRange[0] ? (p.sharpe - sharpeRange[0]) / (sharpeRange[1] - sharpeRange[0]) : 0.5
                    return <Cell key={i} fill={lerpColor('#94a3b8', '#e0913c', t)} fillOpacity={0.5} r={2} />
                  })}
                </Scatter>
                {/* 자본배분선(CAL) — 원점(rf=0)→접점, 점선 */}
                {cal.length === 2 && (
                  <Scatter data={cal} isAnimationActive={false}
                    line={{ stroke: '#7c3aed', strokeWidth: 1, strokeDasharray: '5 4' }} shape={() => null} legendType="none" />
                )}
                {/* 효율적 경계선 곡선 (목표수익률별 최소분산) — 구름 위, 마커 아래 */}
                <Scatter data={data.frontier} isAnimationActive={false}
                  line={{ stroke: '#1763b6', strokeWidth: 2 }} shape={() => null} legendType="none" />
                {/* 개별 종목 */}
                <Scatter data={data.assets} isAnimationActive={false} shape="circle" fill="#1763b6">
                  {data.assets.map((a: any, i: any) => <Cell key={i} r={5} fill={SERIES[i % SERIES.length]} />)}
                </Scatter>
                {/* 슬라이더로 선택한 경계선 점 */}
                {fp && <Scatter data={[fp]} isAnimationActive={false} shape="cross" fill="#7c3aed" />}
                {/* 최대샤프 ★ / 최소분산 ◆ / 리스크패리티 ▲ */}
                <Scatter data={[data.max_sharpe]} isAnimationActive={false} shape="star" fill="#ef4444" />
                <Scatter data={[data.min_vol]} isAnimationActive={false} shape="diamond" fill="#3b82f6" />
                {data.risk_parity && <Scatter data={[data.risk_parity]} isAnimationActive={false} shape="triangle" fill="#16a34a" />}
              </ScatterChart>
            </ResponsiveContainer>
            <div className="flex gap-4 justify-center flex-wrap text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              <span><span className="inline-block w-3 border-t-2 align-middle" style={{ borderColor: '#1763b6' }} /> 효율적 경계선</span>
              <span className="text-violet-500"><span className="inline-block w-3 border-t border-dashed align-middle border-violet-500" /> 자본배분선</span>
              <span>★ 최대 샤프</span><span>◆ 최소 변동성</span><span className="text-green-600">▲ 리스크 패리티</span><span>✕ 선택</span><span>● 개별 종목</span>
            </div>
            {/* 목표수익률 슬라이더 — 경계선 위를 움직이며 그 점의 비중 구성을 본다 */}
            {data.frontier.length > 1 && fp && (
              <div className="mt-3 border border-gray-100 dark:border-[#232d40] rounded-md p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">목표수익률 선택 (경계선)</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">수익률 <b className={up(fp.ret)}>{pct(fp.ret)}</b> · 변동성 <b className="text-gray-700 dark:text-gray-200">{fp.vol.toFixed(1)}%</b></span>
                </div>
                <input type="range" min={0} max={data.frontier.length - 1} value={idx}
                  onChange={e => setFIdx(+e.target.value)}
                  className="w-full cursor-pointer accent-brand-500" />
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                  {fp.weights.map((wv: any, i: any) => wv > 0.001 && (
                    <span key={i} className="text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-700 dark:text-gray-200">{sym(data.assets[i]?.market)}</span> {(wv * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              </div>
            )}
            {data.shrinkage > 0 && (
              <div className="text-[11px] text-center text-gray-400 dark:text-gray-500 mt-2">
                공분산: Ledoit-Wolf 수축(강도 {data.shrinkage.toFixed(2)}) — 표본공분산 추정오차로 인한 코너해 완화
              </div>
            )}
            {/* 자산 간 상관행렬 — 목표수익률 슬라이더 아래(분산효과의 근원). flex-1로 우측 열(개별 종목
                통계) 바닥까지 높이를 채우고, 행렬은 남는 공간에 세로 중앙정렬해 크게 보이게 한다. */}
            <div className="border border-gray-100 dark:border-[#232d40] rounded-md p-3 mt-4 flex-1 flex flex-col">
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">자산 간 상관행렬<InfoTooltip width="w-72">상관이 낮을수록(파랑) 분산효과가 커져 경계선이 더 왼쪽으로 휩니다. 1에 가까울수록(빨강) 함께 움직여 분산이 잘 안 됩니다.</InfoTooltip></div>
              <div className="flex-1 flex flex-col justify-center">
                <CorrMatrix labels={data.corr_labels} matrix={data.corr_matrix} />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <WeightCard title="★ 최대 샤프 포트폴리오" spot={data.max_sharpe} onSend={onSend} />
            <WeightCard title="◆ 최소 변동성 포트폴리오" spot={data.min_vol} onSend={onSend} />
            {data.risk_parity && <WeightCard title="▲ 리스크 패리티 (기대수익 추정 비의존·OOS 견고)" spot={data.risk_parity} onSend={onSend} />}
            {/* 개별 종목 통계 — 비중 카드 아래, 좁은 우측 열(백테스트 표 폭) */}
            <div className="border border-gray-100 dark:border-[#232d40] rounded-md p-3">
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">개별 종목 통계 (연율)</div>
              <AssetStatsTable assets={data.assets} />
            </div>
          </div>
        </div>
        <div className="mt-3"><Caveat kind="portfolio" /></div>
        </>
      )}
    </Card>
  )
}

// 자산 간 상관행렬 히트맵 — 파랑(음의 상관)·흰(무상관)·빨강(높은 양의 상관).
function CorrMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  if (!matrix?.length) return <div className="text-xs text-gray-400 py-6 text-center">데이터 없음</div>
  const bg = (v: any) => v >= 0 ? lerpColor('#f8fafc', '#ef4444', Math.min(1, v)) : lerpColor('#f8fafc', '#3b82f6', Math.min(1, -v))
  // 영역 가로폭에 꽉 차게(table-fixed w-full) — 데이터 칸은 남는 폭을 균등 분할해 커진다. 행 높이도 넉넉히.
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse table-fixed">
        <thead>
          <tr><th className="w-14" />{labels.map((l) => <th key={l} className="px-1 py-1.5 font-medium text-gray-400 dark:text-gray-500">{sym(l)}</th>)}</tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="pr-2 text-right font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">{sym(labels[i])}</td>
              {row.map((v, j) => (
                <td key={j} className="text-center tabular-nums text-gray-700 border border-white/60 dark:border-[#1a2234]"
                  style={{ backgroundColor: bg(v), height: 56 }}>{v.toFixed(2)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 개별 종목 연율 통계 표 — 수익률·변동성·샤프.
function AssetStatsTable({ assets }: { assets: AssetPoint[] }) {
  if (!assets?.length) return <div className="text-xs text-gray-400 py-6 text-center">데이터 없음</div>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[11px] text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-[#232d40]">
          <th className="px-2 py-1.5 text-left font-medium">종목</th>
          <th className="px-2 py-1.5 text-right font-medium">수익률</th>
          <th className="px-2 py-1.5 text-right font-medium">변동성</th>
          <th className="px-2 py-1.5 text-right font-medium">샤프</th>
        </tr>
      </thead>
      <tbody>
        {assets.map((a, i) => (
          <tr key={a.market} className="border-b border-gray-50 dark:border-[#232d40]/50">
            <td className="px-2 py-1.5"><span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: SERIES[i % SERIES.length] }} /><span className="font-medium text-gray-700 dark:text-gray-200">{sym(a.market)}</span> <span className="text-gray-400 dark:text-gray-500">{a.korean_name}</span></td>
            <td className={`px-2 py-1.5 text-right tabular-nums ${up(a.ret)}`}>{pct(a.ret)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.vol.toFixed(1)}%</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{(a.sharpe ?? 0).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WeightCard({ title, spot, onSend }: { title: string; spot: PortfolioSpot; onSend?: (payload: any) => void }) {
  // 최적 비중을 백테스트로 넘길 payload (비중은 %로 — 백테스트가 % 입력을 받음)
  const send = () => onSend?.({
    markets: spot.weights.map((w) => w.market),
    weights: spot.weights.map((w) => +(w.weight * 100).toFixed(1)),
  })
  return (
    <div className="border border-gray-100 dark:border-[#232d40] rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">{title}</div>
        {spot.diversification > 0 && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500" title="분산효과 비율 — 클수록 분산으로 위험을 더 줄임">분산 {spot.diversification.toFixed(2)}</span>
        )}
      </div>
      <div className="flex gap-3 text-[11px] text-gray-500 dark:text-gray-400 mb-2">
        <span>수익률 <b className={up(spot.ret)}>{pct(spot.ret)}</b></span>
        <span>변동성 <b className="text-gray-700 dark:text-gray-200">{spot.vol?.toFixed(1)}%</b></span>
        <span>샤프 <b className="text-gray-700 dark:text-gray-200">{spot.sharpe?.toFixed(2)}</b></span>
      </div>
      <div className="space-y-1.5">
        {spot.weights.map((w, i) => (
          <div key={w.market}>
            <div className="flex items-center gap-2">
              <span className="w-9 text-[11px] text-gray-600 dark:text-gray-300">{sym(w.market)}</span>
              <div className="flex-1 h-2 bg-gray-100 dark:bg-[#222c3e] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${w.weight * 100}%`, backgroundColor: SERIES[i % SERIES.length] }} />
              </div>
              <span className="w-10 text-right text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">{(w.weight * 100).toFixed(1)}%</span>
            </div>
            {/* 리스크 기여도(%) — 비중과 다를 수 있음. 얇은 회색 막대. */}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-9 text-[9px] text-gray-300 dark:text-gray-600">리스크</span>
              <div className="flex-1 h-1 bg-gray-50 dark:bg-[#161e2e] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gray-400/70" style={{ width: `${spot.risk_contrib?.[i] ?? 0}%` }} />
              </div>
              <span className="w-10 text-right text-[9px] text-gray-400 dark:text-gray-500 tabular-nums">{(spot.risk_contrib?.[i] ?? 0).toFixed(0)}%</span>
            </div>
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
  const W = 1000, H = 1000   // 그래프 레이아웃 좌표(원래 비율 — 노드 배치는 이 안에서)
  const VH = 1000           // 캔버스 높이 — 흰 여백은 줄이되 상하 노드 라벨이 잘리지 않게 여유((VH−H)/2=40px)

  // d3-force 정적 레이아웃(애니메이션 없이 N틱 수렴 후 좌표 고정).
  const laid = useMemo(() => {
    if (!data.nodes.length) return { nodes: [], edges: [] }
    const nodes = data.nodes.map((n: any) => ({ ...n }))
    const idx = Object.fromEntries(nodes.map((n: any, i: any) => [n.market, i]))
    const links = data.edges.map((e: any) => ({ source: idx[e.source], target: idx[e.target], corr: e.corr }))
    const sim = forceSimulation(nodes)
      .force('charge', forceManyBody().strength(-160))
      .force('link', forceLink(links).distance((d: any) => 40 + (1 - d.corr) * 70).strength(0.4))
      .force('center', forceCenter(W / 2, H / 2))
      .force('collide', forceCollide().radius((d: any) => 8 + d.degree * 1.6))
      .stop()
    for (let i = 0; i < 300; i++) sim.tick()
    const pad = 24
    nodes.forEach((n: any) => {
      n.x = Math.max(pad, Math.min(W - pad, n.x))
      n.y = Math.max(pad, Math.min(H - pad, n.y))
    })
    // forceLink가 link.source/target을 노드 객체로 치환하므로 좌표를 명시적으로 해석해 반환.
    const edges = links.map((l: any) => ({ x1: l.source.x, y1: l.source.y, x2: l.target.x, y2: l.target.y, corr: l.corr }))
    return { nodes, edges }
  }, [data])

  const maxDeg = Math.max(1, ...laid.nodes.map((n: any) => n.degree))

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
            <svg viewBox={`0 0 ${W} ${VH}`} preserveAspectRatio="xMidYMid meet" className="w-full" style={{ height: VH }}>
              {/* 그래프(W×H)를 더 큰 영역(W×VH) 안에서 세로 중앙에 배치 */}
              <g transform={`translate(0, ${(VH - H) / 2})`}>
                {laid.edges.map((e: any, i: any) => (
                  <line key={i}
                    x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                    stroke="#cbd5e1" strokeWidth={0.5 + e.corr * 2} strokeOpacity={0.25 + e.corr * 0.45} />
                ))}
                {laid.nodes.map((n: any, i: any) => {
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
              </g>
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
            <div className="md:col-span-2 border border-gray-100 dark:border-[#232d40] rounded-md p-3">
              <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">주성분별 설명분산 (스크리)</div>
              <ResponsiveContainer width="100%" height={88}>
                <BarChart data={scree} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <XAxis dataKey="index" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => 'PC' + v} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} unit="%" />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => v.toFixed(2) + '%'} labelFormatter={v => 'PC' + v} />
                  <Bar dataKey="explained" fill="#4c8dd6" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">종목별 로딩 (PC1 = 가로 시장동조 / PC2 = 세로 2차축)</div>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 16, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <ReferenceLine x={0} stroke="#e5e7eb" /><ReferenceLine y={0} stroke="#e5e7eb" />
              <XAxis type="number" dataKey="pc1" name="PC1" domain={[-1, 1]} tick={{ fontSize: 11, fill: '#9ca3af' }}
                label={{ value: 'PC1 (시장 동조)', position: 'insideBottom', offset: -6, fontSize: 11, fill: '#9ca3af' }} />
              <YAxis type="number" dataKey="pc2" name="PC2" domain={[-1, 1]} tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <ZAxis range={[40, 40]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ fontSize: 12 }}
                formatter={(v: any, n: any) => [v.toFixed(2), n]} labelFormatter={() => ''}
                content={({ payload }) => payload?.[0] ? (
                  <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1 text-xs shadow-sm">
                    <b>{sym(payload[0].payload.market)}</b> {payload[0].payload.korean_name}<br />
                    PC1 {payload[0].payload.pc1.toFixed(2)} · PC2 {payload[0].payload.pc2.toFixed(2)}
                  </div>
                ) : null} />
              <Scatter data={data.loadings} isAnimationActive={false}>
                {data.loadings.map((l: any, i: any) => <Cell key={i} fill={sectorColor(l.category)} />)}
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
          action={<span className="text-[11px] text-gray-400 dark:text-gray-500">{km.n}종 · {km.k}군집</span>}
        />
        {kl ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 16, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" dataKey="volatility" name="변동성" unit="%" tick={{ fontSize: 11, fill: '#9ca3af' }}
                label={{ value: '30일 변동성 (%)', position: 'insideBottom', offset: -6, fontSize: 11, fill: '#9ca3af' }} />
              <YAxis type="number" dataKey="return_1m" name="1개월수익률" unit="%" tick={{ fontSize: 11, fill: '#9ca3af' }}
                domain={[(min) => Math.floor((min - 15) / 10) * 10, (max) => Math.ceil((max + 5) / 10) * 10]} />
              <ZAxis type="number" dataKey="log_value" range={[30, 260]} />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => payload?.[0] ? (
                <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1 text-xs shadow-sm">
                  <b>{sym(payload[0].payload.market)}</b> · 군집 {payload[0].payload.cluster}<br />
                  변동성 {payload[0].payload.volatility}% · 1M {pct(payload[0].payload.return_1m)}
                </div>
              ) : null} />
              <Scatter data={km.points} isAnimationActive={false}>
                {km.points.map((p: any, i: any) => <Cell key={i} fill={CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]} fillOpacity={0.7} />)}
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

function Dendrogram({ dn }: { dn: DendrogramResult }) {
  if (!dn.icoord.length) return <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">데이터 없음</div>
  const allX = dn.icoord.flat(), allY = dn.dcoord.flat()
  const xMax = Math.max(...allX), yMax = Math.max(...allY)
  const W = Math.max(640, dn.markets.length * 22), H = 300, padB = 70, padT = 8
  const sx = (x: any) => (x / xMax) * (W - 20) + 10
  const sy = (y: any) => padT + (1 - y / yMax) * (H - padT - padB)
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
          <text key={m} x={leafX[i]} y={H - padB + 12} fontSize={9} fill={sectorColor(dn.categories[i] ?? '')}
            transform={`rotate(-90 ${leafX[i]} ${H - padB + 12})`} textAnchor="end">{sym(m)}</text>
        ))}
      </svg>
      <div className="mt-1"><SectorLegend /></div>
    </div>
  )
}

// ── 5) 모멘텀 팩터 백테스트 ───────────────────────────────────
function MomentumSection() {
  // 롱숏(학술 달러중립, 공매도 가정) ↔ 롱온리(상위분위 매수만 — 업비트 현물 실행 가능) 토글.
  const [longOnly, setLongOnly] = useState(false)
  const { data, loading } = useMomentum(40, 20, 5, longOnly)
  return (
    <Card>
      <CardHeader
        title={<>횡단면 모멘텀 팩터<InfoTooltip width="w-80">"최근 많이 오른 종목이 계속 오른다"는 모멘텀을 검증합니다. 매 5일마다 과거 20일 수익률 상위 20%를 <b>롱</b>{longOnly ? ' 매수합니다(공매도 없이 현물 실행 가능).' : <>, 하위 20%를 <b>숏</b>하는 달러중립 팩터입니다(공매도 가정 — 업비트 현물에선 실행 불가, 학술적 팩터 검증용).</>} 동일가중 매수보유가 벤치마크이며 거래비용 <b>{data.fee_bps ?? 5}bps</b>를 차감했습니다.</InfoTooltip></>}
        subtitle={longOnly ? '20일 모멘텀 · 5일 리밸런스 · 롱온리(현물)' : '20일 모멘텀 · 5일 리밸런스 · 롱숏 달러중립'}
        action={
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[['ls', '롱숏'], ['lo', '롱온리']].map(([k, l]) => (
                <button key={k} onClick={() => setLongOnly(k === 'lo')}
                  className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer ${(k === 'lo') === longOnly ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-[#222c3e] text-gray-500'}`}>{l}</button>
              ))}
            </div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{data.n}종</span>
          </div>
        }
      />
      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label={longOnly ? '전략 총수익률' : '팩터 총수익률'} value={pct(data.total_return)} color={up(data.total_return)} valueClass="text-xl" />
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
                formatter={(v: any, n: any) => [v.toFixed(1), n === 'factor' ? (longOnly ? '롱온리 전략' : '모멘텀 팩터') : '벤치마크']} />
              <ReferenceLine y={100} stroke="#e5e7eb" />
              <Line dataKey="factor" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="benchmark" stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className={`grid ${longOnly ? 'grid-cols-1 max-w-md' : 'grid-cols-2 max-w-2xl'} gap-4 mt-4 mx-auto`}>
            <HoldingList title="현재 롱 (모멘텀 상위)" rows={data.long} color="text-red-500" />
            {!longOnly && <HoldingList title="현재 숏 (모멘텀 하위)" rows={data.short} color="text-blue-500" />}
          </div>
          <Caveat kind="momentum" />
        </>
      )}
    </Card>
  )
}

function HoldingList({ title, rows, color }: { title: string; rows: MomentumHolding[]; color: string }) {
  return (
    <div className="border border-gray-100 dark:border-[#232d40] rounded-md p-3">
      <div className={`text-xs font-semibold mb-2 ${color}`}>{title}</div>
      <div className="space-y-1">
        {rows.map((h) => (
          <div key={h.market} className="flex justify-between text-xs">
            <span className="text-gray-700 dark:text-gray-200">{sym(h.market)} <span className="text-gray-400 dark:text-gray-500">{h.korean_name}</span></span>
            <span className={`font-medium tabular-nums ${up(h.momentum)}`}>{pct(h.momentum)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 6) 공적분 페어트레이딩 ────────────────────────────────────
function SignalBadge({ signal }: { signal: string }) {
  const map = {
    LONG_SPREAD: ['롱 스프레드', 'bg-red-50 text-red-600'],
    SHORT_SPREAD: ['숏 스프레드', 'bg-blue-50 text-blue-600'],
    NEUTRAL: ['중립', 'bg-gray-100 dark:bg-[#222c3e] text-gray-500 dark:text-gray-400'],
  }
  const [label, cls] = (map as any)[signal] || map.NEUTRAL
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>{label}</span>
}

function PairsSection() {
  const { data, loading } = usePairs(50)
  return (
    <Card>
      <CardHeader
        title={<>공적분 페어트레이딩<InfoTooltip width="w-80">두 코인의 로그가격이 장기적으로 같이 움직이면(<b>공적분</b>) 스프레드가 평균으로 회귀합니다. Engle-Granger 검정 p&lt;0.05 페어를 찾고, 스프레드 z점수 |z|&gt;2면 진입 신호(z↑=숏 스프레드, z↓=롱 스프레드).</InfoTooltip></>}
        subtitle="statsmodels coint + ADF · 평균회귀 페어 · 헤지비율 β는 형성기간(OOS) 분리"
        action={<span className="text-[11px] text-gray-400 dark:text-gray-500">{data.tested}쌍 검정 · {data.found}쌍 p&lt;0.05 · <b className="text-gray-600 dark:text-gray-300">{data.found_fdr ?? 0}쌍 FDR통과</b></span>}
      />
      {loading ? <Spinner /> : data.pairs.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">공적분 페어 없음</div>
      ) : (
        <>
          {data.best && <PairBacktestChart best={data.best} />}
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-[#232d40]">
                  <th className="px-3 py-2 text-left font-medium w-[22%]">페어</th>
                  <th className="px-3 py-2 text-right font-medium">p값</th>
                  <th className="px-3 py-2 text-center font-medium">FDR</th>
                  <th className="px-3 py-2 text-right font-medium">헤지비율 β</th>
                  <th className="px-3 py-2 text-right font-medium">z점수</th>
                  <th className="px-3 py-2 text-center font-medium">신호</th>
                  <th className="px-3 py-2 text-right font-medium">검증수익</th>
                  <th className="px-3 py-2 text-right font-medium">거래·승률</th>
                </tr>
              </thead>
              <tbody>
                {data.pairs.map((p: any, i: any) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">
                      {sym(p.market1)} <span className="text-gray-300">↔</span> {sym(p.market2)}
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 font-normal">{p.korean_name1} · {p.korean_name2}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{p.pvalue.toFixed(4)}</td>
                    <td className="px-3 py-2 text-center">{p.fdr_pass
                      ? <span className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-500/10 px-1.5 py-0.5 rounded">통과</span>
                      : <span className="text-[10px] text-gray-400">—</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{p.hedge_ratio.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${Math.abs(p.zscore) > 2 ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>{p.zscore > 0 ? '+' : ''}{p.zscore.toFixed(2)}</td>
                    <td className="px-3 py-2 text-center"><SignalBadge signal={p.signal} /></td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${p.bt_return > 0 ? 'text-red-500' : p.bt_return < 0 ? 'text-blue-500' : 'text-gray-400'}`}>{p.bt_return > 0 ? '+' : ''}{p.bt_return.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400 text-xs">{p.bt_trades}회 · {p.bt_winrate.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Caveat kind="pairs" />
        </>
      )}
    </Card>
  )
}

// 최우수(최저 p값) 페어의 사후검증 — 스프레드 z(±진입선)와 전략 자산곡선을 겹쳐 "실제로 통했는지" 보여준다.
function PairBacktestChart({ best }: { best: PairBacktestDetail }) {
  const total = best.points.length ? best.points[best.points.length - 1].equity - 100 : 0
  return (
    <div className="mb-4 px-3 pt-3 pb-1 rounded-md bg-gray-50 dark:bg-[#0f1626]">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          최우수 페어 사후검증 — {sym(best.market1)} ↔ {sym(best.market2)}
        </div>
        <div className={`text-xs font-semibold tabular-nums ${total >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
          전략 {total >= 0 ? '+' : ''}{total.toFixed(1)}%
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={best.points} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} hide />
          {/* 좌축: 자산곡선, 우축: z점수 */}
          <YAxis yAxisId="eq" tick={{ fontSize: 10, fill: '#9ca3af' }} width={38} />
          <YAxis yAxisId="z" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} width={26} domain={[-4, 4]} />
          <Tooltip
            isAnimationActive={false}
            labelFormatter={(t) => new Date(t * 1000).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
            formatter={(v: any, n: any) => [typeof v === 'number' ? v.toFixed(2) : v, n === 'equity' ? '자산(100기준)' : 'z점수']}
          />
          <ReferenceLine yAxisId="z" y={best.entry} stroke="#f59e0b" strokeDasharray="4 3" />
          <ReferenceLine yAxisId="z" y={-best.entry} stroke="#f59e0b" strokeDasharray="4 3" />
          <ReferenceLine yAxisId="z" y={0} stroke="#e5e7eb" />
          {/* 형성기간/거래기간 경계 — 이 왼쪽은 헤지비율 β 추정용(거래 없음), 오른쪽이 out-of-sample 거래기간. */}
          {best.formation_end > 0 && (
            <ReferenceLine yAxisId="eq" x={best.formation_end} stroke="#94a3b8" strokeDasharray="2 2"
              label={{ value: '거래기간 시작', position: 'insideTopRight', fontSize: 9, fill: '#94a3b8' }} />
          )}
          <Area yAxisId="eq" type="monotone" dataKey="equity" stroke="#1763b6" fill="#1763b6" fillOpacity={0.10} strokeWidth={1.6} isAnimationActive={false} />
          <Line yAxisId="z" type="monotone" dataKey="z" stroke="#9b7fc7" dot={false} strokeWidth={1.2} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 pb-1">
        보라=스프레드 z(우축, |z|&gt;{best.entry} 진입·|z|&lt;{best.exit} 청산) · 파랑=전략 자산곡선(좌축). 헤지비율 β는 형성기간(앞 절반)으로 추정하고 점선 오른쪽(거래기간)만 매매한 <b>out-of-sample</b> 검증.
      </div>
    </div>
  )
}

// ── 7) HMM 시장 국면 ──────────────────────────────────────────
const REGIME_COLORS = ['#3b82f6', '#94a3b8', '#fca5a5', '#ef4444'] // 약세→강세 (파랑→빨강)

function RegimeSection() {
  const { data, loading } = useRegime(2)
  // 연속 같은 국면 구간을 묶어 배경 밴드(ReferenceArea)로.
  const segments = useMemo(() => {
    const segs: any[] = []
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
                formatter={(v: any) => [v.toFixed(1), '시장지수']} />
              <Area dataKey="index" stroke="#1763b6" strokeWidth={1.5} fill="#1763b6" fillOpacity={0.05} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-3 mt-3">
            {data.stats.map((s: any) => (
              <div key={s.regime} className="border border-gray-100 dark:border-[#232d40] rounded-md p-2.5 w-52">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: REGIME_COLORS[s.regime] }} />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{s.label}</span>
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">평균 {pct(s.mean_return)}/일 · 변동 {s.volatility}%</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500">{s.days}일 ({s.share}%)</div>
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
const riskColor = (vol: any) => lerpColor('#94a3b8', '#e0913c', vol / 12) // 일변동성 0~12%+ → 회색→앰버
const fmtKrwShort = (v: any) => {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + '조'
  if (v >= 1e8) return Math.round(v / 1e8).toLocaleString() + '억'
  return Math.round(v / 1e4).toLocaleString() + '만'
}

// VaR(정규근사 1일 95%) = z × 일변동성. coinStats.volatility는 30일 일간수익률 표준편차(%).
function useRiskRows() {
  const { data, loading } = useCoinStats()
  const rows = useMemo(() => (
    data
      .filter((c) => c.volatility > 0)
      .map((c) => ({ ...c, var95: +(VAR_Z * c.volatility).toFixed(2) }))
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
    rows.forEach((r) => { out[Math.min(Math.floor(r.volatility), 10)].count += 1 })
    return out
  }, [rows])

  return (
    <Card>
      <CardHeader
        title={<>변동성 분포<InfoTooltip width="w-80">전 종목의 <b>30일 일간수익률 표준편차(일변동성)</b>를 1%p 구간으로 히스토그램화했습니다. 오른쪽으로 갈수록 하루 가격이 크게 출렁이는 고위험 종목 군집입니다. 색이 진할수록 고변동.</InfoTooltip></>}
        subtitle="전 종목 일변동성(30일) 히스토그램 · 진할수록 고변동"
        action={<span className="text-[11px] text-gray-400 dark:text-gray-500">{rows.length}종</span>}
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
              formatter={(v: any) => [v + '종', '종목 수']} labelFormatter={l => `일변동성 ${l}%`} />
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
        title={<>리스크 랭킹 (1일 95% VaR)<InfoTooltip width="w-80"><b>VaR(Value at Risk)</b>은 "95% 확률로 하루 손실이 이 값을 넘지 않는다"는 위험 척도입니다. 정규분포를 가정해 <b>1.645 × 일변동성</b>으로 근사했습니다. 값이 클수록 하루에 크게 잃을 수 있는 고위험 종목. <b>변동성 z</b>는 전종목 변동성 분포에서의 표준화 위치(평균 대비 ±σ)로, <b>+2σ 이상은 이상 고변동</b>입니다. ※ 정규근사라 실제 꼬리위험(급락)은 과소평가될 수 있습니다.</InfoTooltip></>}
        subtitle="정규근사 1일 95% VaR = 1.645 × 일변동성 · 변동성 z = 분포 내 표준화 위치 · 상위 30종"
        action={<span className="text-[11px] text-gray-400 dark:text-gray-500">전 {rows.length}종 중</span>}
      />
      {loading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-[#232d40]">
                <th className="px-3 py-2 text-left font-medium w-10">#</th>
                <th className="px-3 py-2 text-left font-medium w-[24%]">종목</th>
                <th className="px-3 py-2 text-right font-medium">일변동성</th>
                <th className="px-3 py-2 text-right font-medium">변동성 z</th>
                <th className="px-3 py-2 text-right font-medium">1일 95% VaR</th>
                <th className="px-3 py-2 text-right font-medium">1개월 수익률</th>
                <th className="px-3 py-2 text-right font-medium">24h 거래대금</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.market} onClick={() => navigate(`/coins/${r.market}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2 text-gray-400 dark:text-gray-500 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">
                    {sym(r.market)} <span className="text-gray-400 dark:text-gray-500 font-normal">{r.korean_name}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{r.volatility.toFixed(2)}%</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.vol_zscore >= 2 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                    {r.vol_zscore >= 0 ? '+' : ''}{(r.vol_zscore ?? 0).toFixed(2)}σ
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-500">−{r.var95.toFixed(2)}%</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${up(r.return_1m)}`}>{pct(r.return_1m)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">{fmtKrwShort(r.acc_trade_price_24h)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3"><Caveat kind="risk" /></div>
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
        action={<span className="text-[11px] text-gray-400 dark:text-gray-500">상위 120종</span>}
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
              <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1 text-xs shadow-sm">
                <b>{sym(payload[0].payload.market)}</b> {payload[0].payload.korean_name}<br />
                변동성 {payload[0].payload.x.toFixed(2)}% · 1M {pct(payload[0].payload.y)}
              </div>
            ) : null} />
            <Scatter data={points} isAnimationActive={false} onClick={(p: any) => p?.market && navigate(`/coins/${p.market}`)} className="cursor-pointer">
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
    // 종목 간 관계/구조 (미시) — 종목들이 어떻게 묶이고 누가 중심인가.
    label: '시장 구조', tabs: [
      { id: 'network', label: '상관 네트워크', Comp: NetworkSection },
      { id: 'cluster', label: '클러스터링', Comp: ClusterSection },
    ],
  },
  {
    // 시장 전체 상태 (거시) — 시장이 한 덩어리로 어떻게 움직이고 어떤 국면인가.
    label: '시장 국면', tabs: [
      { id: 'pca', label: 'PCA 요인', Comp: PcaSection },
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
// 경로(/research/{structure·regime·factor·risk})가 어떤 그룹을 보여줄지는 아래 Body 컴포넌트가 결정. 헤더 탭과 1:1.

// 페이지 맨 위 "한눈 요약" 스트립 — 아래 상세 차트들의 핵심 결론만 먼저 보여준다(요약→상세).
// 데이터는 아래 섹션과 같은 훅(캐시 공유)이라 추가 팬아웃 없음.
// 시장 구조(관계) 요약: 네트워크 허브 + 군집 구성.
function StructureSummary() {
  const { data: net } = useNetwork(50)
  const { data: km } = useClusters(80, 4)
  const hub = net.nodes.length ? net.nodes.reduce((a: any, b: any) => (b.degree > a.degree ? b : a)) : null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <StatCard label="네트워크 허브 (최다 연결)" value={hub ? sym(hub.market) : '—'}
        sub={hub ? `${hub.korean_name} · 연결 ${hub.degree}개` : ''} valueClass="text-2xl" />
      <StatCard label="통계적 군집" value={km.k ? `${km.k}군집` : '—'}
        sub={km.n ? `${km.n}종 분류` : ''} valueClass="text-2xl" />
    </div>
  )
}

// 시장 국면(거시) 요약: PC1 동조도 + 현재 HMM 국면.
function RegimeSummary() {
  const { data: pca } = usePCA(50)
  const { data: reg } = useRegime(2)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <StatCard label="시장 동조도 · PC1 설명비율" value={(pca.pc1_explained || 0) + '%'} color="text-brand-600" valueClass="text-2xl" />
      <StatCard label="현재 시장 국면 (HMM)" value={reg.current_label || '—'} valueClass="text-2xl" />
    </div>
  )
}

// (FactorSummary 제거 — 모멘텀 팩터 총수익률·벤치마크·페어 발견은 아래 모멘텀/페어 섹션과 그대로
//  중복돼 상단 요약을 없앴다. 팩터 그룹은 요약 없이 섹션부터 바로 보여준다.)

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

// 여러 훅 결과를 합쳐 로딩/에러를 판정(hook 아님 — 호출부에서 hook을 직접 호출해 결과만 넘긴다).
function gateOf(...hs: { loading: boolean; error: boolean; retry?: () => void }[]) {
  return {
    loading: hs.some(h => h.loading),
    error: hs.some(h => h.error),
    retry: () => hs.forEach(h => h.retry?.()),
  }
}

// 그룹의 요약 + 섹션들을 렌더(게이트는 Body가 이미 통과한 뒤라 여기선 데이터가 준비됨).
// 크로스링크(#network 등) 스크롤은 섹션이 실제로 그려진 뒤(=게이트 통과 후) 실행돼 정확히 동작한다.
function GroupView({ label, Summary }: { label: string; Summary?: ComponentType }) {
  const { hash } = useLocation()
  const group = GROUPS.find(g => g.label === label) ?? GROUPS[0]
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, label])
  return (
    <div className="space-y-6">
      {Summary && <Summary />}
      <section className="space-y-4">
        {group.tabs.map(t => (
          <div key={t.id} id={t.id} className="scroll-mt-20"><t.Comp /></div>
        ))}
      </section>
    </div>
  )
}

// 그룹별 Body — 그 그룹이 쓰는 훅을 모아 게이트한다. 하나라도 로딩/에러면 헤더·푸터만 남기고
// 전체를 PageLoading/PageError로(섹션 카드·스피너 등 다른 컴포넌트는 일절 렌더하지 않음).
// seg마다 별도 컴포넌트라 활성 그룹의 훅만 실행된다(다른 그룹 over-fetch 없음, hook 규칙 준수).
function StructureBody() {
  const g = gateOf(useNetwork(50), useClusters(80, 4))
  if (g.error) return <PageError onRetry={g.retry} />
  if (g.loading) return <PageLoading />
  return <GroupView label="시장 구조" Summary={StructureSummary} />
}
function RegimeBody() {
  const g = gateOf(usePCA(50), useRegime(2))
  if (g.error) return <PageError onRetry={g.retry} />
  if (g.loading) return <PageLoading />
  return <GroupView label="시장 국면" Summary={RegimeSummary} />
}
function FactorBody() {
  // 모멘텀(기본 롱숏)·페어로 초기 게이트. 모멘텀 롱온리 토글은 in-page 상호작용이라 섹션 내부 로딩으로 처리.
  const g = gateOf(useMomentum(40, 20, 5), usePairs(50))
  if (g.error) return <PageError onRetry={g.retry} />
  if (g.loading) return <PageLoading />
  return <GroupView label="팩터 분석" />
}
function RiskBody() {
  const g = gateOf(useCoinStats())   // 리스크 3섹션·요약 모두 coin_stats 파생(dedup)
  if (g.error) return <PageError onRetry={g.retry} />
  if (g.loading) return <PageLoading />
  return <GroupView label="리스크" Summary={RiskSummary} />
}

export default function Analysis() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/research/factor')) return <FactorBody />
  if (pathname.startsWith('/research/risk')) return <RiskBody />
  if (pathname.startsWith('/research/regime')) return <RegimeBody />
  return <StructureBody />
}
