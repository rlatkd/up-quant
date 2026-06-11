import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'
import {
  useIndices, useAssetIndices, useVolumePower, useFx, useNews, useBrief, usePeriodReturns,
} from '../hooks/useTrends'
import { useTickers } from '../hooks/useTickers'
import { useCoinStats } from '../hooks/useAnalysis'
import { useGate } from '../hooks/useGate'
import PageLoading from '../components/ui/PageLoading'
import PageError from '../components/ui/PageError'
import InfoTooltip from '../components/InfoTooltip'
import SignalsPanel from '../components/SignalsPanel'
import { exportCsv } from '../utils/csv'
import type { MarketIndex, VolumePowerItem } from '../types'

const sym = (m: string) => (m || '').replace('KRW-', '')
function rcolor(v: number) {
  return v > 0 ? 'text-red-500' : v < 0 ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'
}
function pct(v: number | null | undefined, d = 2) {
  if (v == null) return '—'
  return (v > 0 ? '+' : '') + v.toFixed(d) + '%'
}
function fmtCap(v: number | null | undefined) {
  if (!v) return '—'
  if (v >= 1e12) return (v / 1e12).toFixed(1) + '조'
  if (v >= 1e8) return Math.round(v / 1e8).toLocaleString() + '억'
  return v.toLocaleString()
}
function SourceError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-[#2a2410] dark:border-amber-700/60 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
      <span>⚠️</span><span>{message}</span>
    </div>
  )
}

// ── ① 시장 지수 카드 (당일/전일 인트라데이 차트) ───────────────
function IndexCard({ idx, mode }: { idx: MarketIndex; mode: string }) {
  const stroke = idx.change_rate > 0 ? '#ef4444' : idx.change_rate < 0 ? '#3b82f6' : '#9ca3af'
  const series = (mode === 'prev' ? idx.prev : idx.today) || []
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{idx.label}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{idx.n}종</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-50">{idx.value.toLocaleString()}</span>
        <span className={`text-xs font-semibold tabular-nums ${rcolor(idx.change_rate)}`}>{pct(idx.change_rate * 100)}</span>
      </div>
      <div className="h-20 mt-2">
        {series.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
              {/* 데이터 범위로 도메인을 맞춰 선이 카드 가로폭을 꽉 채우게(고정 [0,24]면 당일은 현재 시각까지만 그려져 짧음) */}
              <XAxis dataKey="h" type="number" domain={['dataMin', 'dataMax']} hide />
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="2 2" />
              <Tooltip contentStyle={{ fontSize: 11, padding: '3px 8px', borderRadius: 6 }} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                labelFormatter={(h: any) => `${h}시`}
                formatter={(v: any) => [`${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`, '등락률']} />
              <Line dataKey="pct" stroke={stroke} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ── 우측 레일: 주간 상승 TOP10 ─────────────────────────────────
function RankList({ title, rows, valueFn, valueColor, sub }: { title: string; rows: any[]; valueFn: (r: any) => any; valueColor: (r: any) => string; sub?: any }) {
  const navigate = useNavigate()
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-4">
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">{title}{sub && <span className="text-[10px] font-normal text-gray-400 ml-1">{sub}</span>}</div>
      <ol className="space-y-0.5">
        {rows.map((r, i: number) => (
          <li key={r.market} onClick={() => navigate(`/coins/${r.market}`)}
            className="flex items-center gap-3 text-sm py-0.5 px-1 rounded hover:bg-gray-50 dark:hover:bg-[#222c3e] cursor-pointer">
            <span className="w-4 text-right text-xs text-gray-400 tabular-nums">{i + 1}</span>
            <span className="font-medium text-gray-800 dark:text-gray-100 w-12 shrink-0">{sym(r.market)}</span>
            <span className="flex-1 text-xs text-gray-400 dark:text-gray-500 truncate">{r.korean_name}</span>
            <span className={`font-semibold tabular-nums text-xs ${valueColor(r)}`}>{valueFn(r)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── ② 오늘의 환율 ──────────────────────────────────────────────
function FxRow() {
  const { data, loading } = useFx()
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">오늘의 환율</span>
        <span className="text-[10px] text-gray-400">{data.as_of || ''}</span>
      </div>
      {loading ? <div className="text-xs text-gray-400 py-3 text-center">불러오는 중…</div>
        : data.error ? <SourceError message={data.error} />
        : (
          <div className="space-y-4">
            {data.rates.map((r) => {
              const cdata = (r.spark || []).map((v, i) => ({ d: data.spark_dates?.[i] ?? String(i), v }))
              return (
                <div key={r.pair}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{r.label} <span className="text-gray-400 dark:text-gray-500 font-normal">({r.pair}{r.unit > 1 ? `·${r.unit}` : ''})</span></span>
                    <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-50 ml-auto">{r.price.toLocaleString()}원</span>
                  </div>
                  {cdata.length > 1 ? (
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={cdata} margin={{ top: 6, right: 10, bottom: 0, left: -6 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="d" tick={{ fontSize: 10, fill: '#9ca3af' }} minTickGap={28} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} domain={['auto', 'auto']} width={46}
                          tickFormatter={(v: any) => Number(v).toLocaleString()} />
                        <Tooltip contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 6 }}
                          labelFormatter={(l: any) => l} formatter={(v: any) => [`${Number(v).toLocaleString()}원`, '']} separator="" />
                        <Line dataKey="v" stroke="#8b5cf6" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[150px] flex items-center justify-center text-xs text-gray-400 dark:text-gray-500">추이 데이터 없음</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

// ── ④ 최신 뉴스 (페이지네이션) ────────────────────────────────
const NEWS_PER = 8
function NewsRow() {
  const { data, loading } = useNews()
  const [page, setPage] = useState(0)
  const items = data.items || []
  const pages = Math.max(1, Math.ceil(items.length / NEWS_PER))
  const slice = items.slice(page * NEWS_PER, page * NEWS_PER + NEWS_PER)
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">최신 뉴스</span>
        {!data.error && items.length > 0 && (
          <span className="flex items-center gap-2 text-xs text-gray-400">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
            {page + 1}/{pages}
            <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
              className="px-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">›</button>
          </span>
        )}
      </div>
      {loading ? <div className="text-xs text-gray-400 py-3 text-center">불러오는 중…</div>
        : data.error ? <SourceError message={data.error} />
        : (
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
            {slice.map((it) => (
              <a key={it.url} href={it.url} target="_blank" rel="noopener noreferrer"
                className="flex items-baseline justify-between gap-3 text-sm py-1 border-b border-gray-50 dark:border-[#232d40]/50 hover:text-brand-600 transition-colors">
                <span className="text-gray-700 dark:text-gray-200 truncate">{it.title}</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0">{it.published}</span>
              </a>
            ))}
          </div>
        )}
    </div>
  )
}

// ── ⑤ 디지털 자산 표 (기간별 / 시가총액 탭) ───────────────────
const RET_COLS = [
  { key: 'r1w', label: '1주' }, { key: 'r1m', label: '1개월' }, { key: 'r3m', label: '3개월' },
  { key: 'r6m', label: '6개월' }, { key: 'r1y', label: '1년' },
]
function PeriodTable() {
  const { data, loading } = usePeriodReturns()
  const navigate = useNavigate()
  const [view, setView] = useState<'returns' | 'mcap'>('returns')
  const [sortKey, setSortKey] = useState('r1w')

  const rows = useMemo(() => {
    const arr = [...(data.rows || [])]
    const key = view === 'mcap' ? 'market_cap' : sortKey
    arr.sort((a, b) => {
      const av = (a as any)[key], bv = (b as any)[key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    })
    return arr
  }, [data, view, sortKey])

  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-[#232d40] flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">디지털 자산</span>
        <div className="flex gap-1">
          {[['returns', '기간별 상승률'], ['mcap', '시가총액']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k as any)}
              className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer ${view === k ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-[#222c3e] text-gray-500'}`}>{l}</button>
          ))}
        </div>
        <InfoTooltip>기간별: 1주~1년 수익률(일봉·월봉). 시가총액: 외부(CoinGecko) 시총 기준 정렬. 헤더 클릭 시 그 기간으로 정렬됩니다.</InfoTooltip>
        <button onClick={() => exportCsv('digital_assets', rows, [
          { key: 'market', label: '마켓' }, { key: 'korean_name', label: '한글명' },
          { key: 'r1w', label: '1주%' }, { key: 'r1m', label: '1개월%' }, { key: 'r3m', label: '3개월%' },
          { key: 'r6m', label: '6개월%' }, { key: 'r1y', label: '1년%' },
          { key: 'market_cap', label: '시가총액(KRW)' }, { key: 'acc_trade_price_24h', label: '24h거래대금(KRW)' },
        ])}
          className="ml-auto text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-[#2c3850] text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-500 cursor-pointer transition-colors">
          ⬇ CSV
        </button>
      </div>
      {loading ? <div className="py-8 text-center text-sm text-gray-400">불러오는 중…</div> : (
        <div className="max-h-[560px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-[#1a2234]">
              <tr className="text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-[#232d40]">
                <th className="px-3 py-2 text-left font-medium">코인</th>
                {view === 'mcap' ? (
                  <><th className="px-3 py-2 text-right font-medium">시가총액</th><th className="px-3 py-2 text-right font-medium">순위</th><th className="px-3 py-2 text-right font-medium">1주</th><th className="px-3 py-2 text-right font-medium">1개월</th></>
                ) : RET_COLS.map(c => (
                  <th key={c.key} onClick={() => setSortKey(c.key)}
                    className={`px-3 py-2 text-right font-medium cursor-pointer hover:text-gray-600 ${sortKey === c.key ? 'text-brand-600' : ''}`}>{c.label}{sortKey === c.key ? ' ↓' : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.market} onClick={() => navigate(`/coins/${r.market}`)}
                  className="border-b border-gray-50 dark:border-[#232d40]/50 hover:bg-gray-50 dark:hover:bg-[#222c3e] cursor-pointer">
                  <td className="px-3 py-1.5"><span className="font-medium text-gray-800 dark:text-gray-100">{sym(r.market)}</span><span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{r.korean_name}</span></td>
                  {view === 'mcap' ? (
                    <>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtCap(r.market_cap)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">{r.market_cap_rank || '—'}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${rcolor(r.r1w ?? 0)}`}>{pct(r.r1w)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${rcolor(r.r1m ?? 0)}`}>{pct(r.r1m)}</td>
                    </>
                  ) : RET_COLS.map(c => (
                    <td key={c.key} className={`px-3 py-1.5 text-right tabular-nums ${rcolor((r as any)[c.key] ?? 0)}`}>{pct((r as any)[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── ⑥ 디지털 자산 지수 표 (시장/전략/테마/섹터 탭) ────────────
function AssetIndexTable() {
  const { data, loading } = useAssetIndices()
  const navigate = useNavigate()
  const tabs = ['시장', '전략', '테마', '섹터']
  const [tab, setTab] = useState('시장')
  const rows = (data.rows || []).filter((r) => r.tab === tab)
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-[#232d40] flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">디지털 자산 지수 <span className="text-[10px] font-normal text-gray-400">· 자체 동일가중</span></span>
        <div className="flex gap-1">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer ${tab === t ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-[#222c3e] text-gray-500'}`}>{t} 지수</button>
          ))}
        </div>
      </div>
      {loading ? <div className="py-6 text-center text-sm text-gray-400">불러오는 중…</div> : (
        // table-fixed + 고정 컬럼폭 — 탭마다 내용 길이가 달라 컬럼 위치가 흔들리던 것 고정
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-[#232d40]">
              <th className="px-4 py-2 text-left font-medium w-[20%]">지수</th>
              <th className="px-3 py-2 text-left font-medium hidden md:table-cell w-[32%]">개요</th>
              <th className="px-3 py-2 text-right font-medium">지수</th>
              <th className="px-3 py-2 text-right font-medium">전일대비</th>
              <th className="px-3 py-2 text-right font-medium">1개월</th>
              <th className="px-3 py-2 text-right font-medium">3개월</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} onClick={() => navigate(r.tab === '섹터' ? '/market/sectors' : '/research/structure')}
                className="border-b border-gray-50 dark:border-[#232d40]/50 hover:bg-gray-50 dark:hover:bg-[#222c3e] cursor-pointer">
                <td className="px-4 py-2"><span className="font-medium text-gray-800 dark:text-gray-100">{r.label}</span><span className="text-[10px] text-gray-400 ml-1.5">{r.n}종</span></td>
                <td className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 hidden md:table-cell">{r.desc}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">{r.value.toLocaleString()}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${rcolor(r.d1 ?? 0)}`}>{pct(r.d1)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${rcolor(r.m1 ?? 0)}`}>{pct(r.m1)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${rcolor(r.m3 ?? 0)}`}>{pct(r.m3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── 랭킹 그리드 (급상승·급하락·거래량급증·체결강도) ───────────
function RankingGrid() {
  const { tickers } = useTickers()
  const { data: stats } = useCoinStats()
  const { data: vp, loading: vpLoading } = useVolumePower()

  const gainers = useMemo(() => [...tickers].sort((a, b) => b.change_rate - a.change_rate).slice(0, 6), [tickers])
  const losers = useMemo(() => [...tickers].sort((a, b) => a.change_rate - b.change_rate).slice(0, 6), [tickers])
  const surge = useMemo(() => [...stats].filter((s) => s.vol_surge > 0).sort((a, b) => b.vol_surge - a.vol_surge).slice(0, 6), [stats])

  // 우측 레일에 주간 상승 TOP10 아래로 수직 스택. fragment로 반환해 카드들이 레일 flex의 직접 자식이
  // 되게 한다(레일의 justify-between이 TOP10+이 카드들을 한꺼번에 균등 분배 → 최하단이 좌측 바닥에 맞음).
  return (
    <>
      <RankList title="급상승" sub="오늘" rows={gainers} valueFn={(r) => pct(r.change_rate * 100, 1)} valueColor={(r) => rcolor(r.change_rate)} />
      <RankList title="급하락" sub="오늘" rows={losers} valueFn={(r) => pct(r.change_rate * 100, 1)} valueColor={(r) => rcolor(r.change_rate)} />
      <RankList title="거래량 급증" sub="7일평균 대비" rows={surge} valueFn={(r) => r.vol_surge.toFixed(1) + '배'} valueColor={() => 'text-gray-700 dark:text-gray-200'} />
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-4">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">체결강도 <span className="text-[10px] font-normal text-gray-400">당일 누적 · 매수 우위</span></div>
        {vpLoading ? <div className="text-xs text-gray-400 py-3 text-center">불러오는 중…</div>
          : vp.error ? <SourceError message={vp.error} /> : <PowerList rows={vp.buy} />}
      </div>
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-4">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">체결강도 <span className="text-[10px] font-normal text-gray-400">당일 누적 · 매도 우위</span></div>
        {vpLoading ? <div className="text-xs text-gray-400 py-3 text-center">불러오는 중…</div>
          : vp.error ? <SourceError message={vp.error} /> : <PowerList rows={vp.sell} />}
      </div>
    </>
  )
}
function PowerList({ rows }: { rows: VolumePowerItem[] }) {
  const navigate = useNavigate()
  return (
    <ol className="space-y-0.5">
      {rows.map((r, i: number) => (
        <li key={r.market} onClick={() => navigate(`/coins/${r.market}`)}
          className="flex items-center gap-2 text-sm py-0.5 px-1 rounded hover:bg-gray-50 dark:hover:bg-[#222c3e] cursor-pointer">
          <span className="w-4 text-right text-xs text-gray-400 tabular-nums">{i + 1}</span>
          <span className="flex-1 text-gray-700 dark:text-gray-200 truncate">{r.korean_name}</span>
          <span className={`font-semibold tabular-nums text-xs ${r.power >= 100 ? 'text-red-500' : 'text-blue-500'}`}>{r.power.toFixed(0)}</span>
        </li>
      ))}
    </ol>
  )
}

export default function Dashboard() {
  // 페이지가 쓰는 모든 데이터(자식 컴포넌트가 호출하는 것 포함, react-query 디둡)를 여기서 모아
  // 로딩/에러를 한 번에 판정한다 → 하나라도 로딩이면 헤더·푸터만 남기고 전체가 PageLoading,
  // 하드 에러면 전체가 PageError(다른 컴포넌트는 일절 렌더하지 않음).
  // 핵심 데이터 + 외부 소스를 모두 부팅 프리페치로 데우므로, 한 화면으로 한 번에 마운트하기 위해
  // 외부 소스(환율·뉴스·체결강도)도 게이트에 포함한다. 워밍 후엔 캐시 히트라 즉시, 죽은 소스는
  // 백엔드가 4초 타임아웃 후 에러를 60초 캐시 → 게이트가 곧 통과되고 그 위젯만 SourceError를 띄운다.
  const indicesH = useIndices()
  const briefH = useBrief()
  const prH = usePeriodReturns()
  const assetH = useAssetIndices()
  const tickersH = useTickers()
  const statsH = useCoinStats()
  const fxH = useFx()
  const newsH = useNews()
  const vpH = useVolumePower()
  const [mode, setMode] = useState<'today' | 'prev'>('today')

  const indices = indicesH.data, brief = briefH.data, pr = prH.data
  const weekly = useMemo(() => [...(pr.rows || [])].filter((r) => r.r1w != null).sort((a, b) => (b.r1w ?? 0) - (a.r1w ?? 0)).slice(0, 10), [pr])

  const gate = useGate(indicesH, briefH, prH, assetH, tickersH, statsH, fxH, newsH, vpH)
  if (gate.error) return <PageError onRetry={gate.retry} />
  if (gate.loading) return <PageLoading />

  return (
    <div className="space-y-5">
      {/* 오늘의 시황 (최상단) */}
      {brief && (
        <div className="bg-brand-50 dark:bg-[#11203a] border border-brand-100 dark:border-[#1f3358] rounded-md px-4 py-3 text-sm text-gray-700 dark:text-gray-200 flex items-baseline gap-2">
          <span className="font-semibold text-brand-700 dark:text-brand-400 shrink-0">오늘의 시황</span>
          <span className="flex-1">{brief.text}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 whitespace-nowrap">{brief.as_of}</span>
        </div>
      )}

      {/* 최신 뉴스 (최상단) */}
      <NewsRow />

      {/* 본문 2-컬럼: 좌(시장지수·환율·시그널, 2/3) / 우 레일(주간 TOP10 + 랭킹 수직 스택, 1/3) */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* ① 시장 지수 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">시장 지수 <span className="text-[10px] font-normal text-gray-400">· 자체 동일가중</span></span>
              <div className="flex gap-1">
                {[['today', '당일'], ['prev', '전일']].map(([k, l]) => (
                  <button key={k} onClick={() => setMode(k as any)}
                    className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer ${mode === k ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-[#222c3e] text-gray-500'}`}>{l}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {indices.indices.map((idx) => <IndexCard key={idx.key} idx={idx} mode={mode} />)}
            </div>
          </div>
          {/* ② 오늘의 환율 */}
          <FxRow />
          {/* ③ 실행 가능한 시그널 (모멘텀·페어·국면·돌파) */}
          <SignalsPanel />
        </div>
        {/* 우측 레일: 주간 TOP10 + 랭킹 카드들을 컬럼 높이에 맞춰 균등 분배(justify-between) → 최하단이
            좌측(실행 가능한 시그널) 바닥에 맞고, 카드 사이 간격이 균일하게 늘어난다. gap-4는 최소 간격. */}
        <div className="flex flex-col gap-4 justify-between">
          <RankList title="주간 상승 TOP 10" rows={weekly} valueFn={(r) => pct(r.r1w, 1)} valueColor={() => 'text-red-500'} />
          <RankingGrid />
        </div>
      </div>

      {/* ⑤ 디지털 자산 (기간별/시총) */}
      <PeriodTable />

      {/* ⑥ 디지털 자산 지수 (시장/전략/테마/섹터) */}
      <AssetIndexTable />
    </div>
  )
}
