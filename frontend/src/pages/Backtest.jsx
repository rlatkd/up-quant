import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'
import { useTickers } from '../hooks/useTickers'
import PageLoading from '../components/ui/PageLoading'
import { runMaCross, runRsi, runPortfolio, runCompare, runWalkForward } from '../api/backtest'
import InfoTooltip from '../components/InfoTooltip'
import { SERIES } from '../theme'

const STRATEGIES = [
  { key: 'ma',  label: 'MA 크로스' },
  { key: 'rsi', label: 'RSI 역추세' },
  { key: 'compare', label: '전략 비교' },
  { key: 'walkforward', label: '워크포워드' },
  { key: 'portfolio', label: '포트폴리오 보유' },
]

function MetricCard({ label, value, color = 'text-gray-800', sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md px-5 py-4 text-center">
      <div className="text-xs text-gray-400 mb-1.5">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

// 리스크 조정 지표 색상: 양수=빨강(좋음), 음수=파랑(나쁨), 0 부근=회색
const raColor = v => (v > 0.1 ? 'text-red-500' : v < -0.1 ? 'text-blue-500' : 'text-gray-600')

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )
}

export default function Backtest({ preset }) {
  const { tickers, loading: tLoading } = useTickers()
  // 포트폴리오 최적화에서 비중을 넘겨받았으면(preset) '포트폴리오 보유' 전략으로 진입.
  const [strategy, setStrategy] = useState(preset?.weights?.length ? 'portfolio' : 'ma')
  const [market,   setMarket]   = useState('KRW-BTC')
  const [params,   setParams]   = useState({ fast: 5, slow: 20, period: 14, oversold: 30, overbought: 70, count: 200, fee: 5 })
  const [result,   setResult]   = useState(null)
  const [loading,  setLoading]  = useState(false)

  function setParam(key, val) {
    setParams(prev => ({ ...prev, [key]: Number(val) }))
  }

  async function handleRun() {
    setLoading(true)
    try {
      const p = { market, count: params.count, fee_bps: params.fee }
      const data = strategy === 'ma'
        ? await runMaCross({ ...p, fast: params.fast, slow: params.slow })
        : await runRsi({ ...p, period: params.period, oversold: params.oversold, overbought: params.overbought })
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  // 진입 즉시 기본 전략(KRW-BTC·MA 크로스) 결과를 보여준다 (마운트 후 마이크로태스크 — 동기 setState 회피)
  // 단, 포트폴리오로 진입했으면 단일 전략 실행은 건너뛴다(PortfolioBacktest가 자체 실행).
  useEffect(() => {
    if (strategy !== 'portfolio') Promise.resolve().then(handleRun)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (tLoading) return <PageLoading />

  const equityData = result?.equity.map(e => ({
    time: new Date(e.time * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    value: e.value,
    benchmark: e.benchmark,
    benchmark_btc: e.benchmark_btc,
  })) ?? []

  const tradeData = (result?.trades ?? []).filter(t => t.side === 'SELL')

  return (
    <div className="space-y-4">

      {/* 전략 선택 (공통) */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 mb-3">
          전략 선택
          <InfoTooltip>
            과거 일봉으로 전략을 시뮬레이션합니다. MA 크로스·RSI는 단일 종목 매매 전략이고, 포트폴리오 보유는 여러 종목을 비중대로 들고 있었을 때의 성과(매수보유/리밸런스)를 봅니다. 분석 카트에 담은 종목이 포트폴리오로 들어옵니다.
          </InfoTooltip>
        </div>
        <div className="flex gap-1.5">
          {STRATEGIES.map(s => (
            <button
              key={s.key}
              onClick={() => setStrategy(s.key)}
              className={`px-4 py-1.5 text-sm rounded font-medium cursor-pointer transition-colors ${
                strategy === s.key ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {strategy === 'portfolio' ? (
        <PortfolioBacktest tickers={tickers} preset={preset} />
      ) : strategy === 'compare' ? (
        <CompareBody market={market} setMarket={setMarket} tickers={tickers} />
      ) : strategy === 'walkforward' ? (
        <WalkForwardBody market={market} setMarket={setMarket} tickers={tickers} />
      ) : (
        <SingleStrategyBody
          strategy={strategy} market={market} setMarket={setMarket} tickers={tickers}
          params={params} setParam={setParam} loading={loading} handleRun={handleRun}
          result={result} equityData={equityData} tradeData={tradeData}
        />
      )}
    </div>
  )
}

// 종목 선택 드롭다운(전략 비교·워크포워드 공용)
function MarketSelect({ market, setMarket, tickers }) {
  return (
    <select value={market} onChange={e => setMarket(e.target.value)}
      className="border border-gray-200 rounded-md px-3 py-2 text-sm cursor-pointer focus:outline-none focus:border-brand-400">
      {tickers.slice(0, 80).map(t => (
        <option key={t.market} value={t.market}>{t.market.replace('KRW-', '')} · {t.korean_name}</option>
      ))}
    </select>
  )
}

// 다중 전략 겹쳐 비교 — 한 종목에 MA·RSI를 동시에 돌려 자산곡선을 겹쳐 본다.
function CompareBody({ market, setMarket, tickers }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const run = () => { setLoading(true); runCompare({ market, count: 200 }).then(setData).finally(() => setLoading(false)) }
  useEffect(() => { Promise.resolve().then(run) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = data ? data.times.map((t, i) => ({
    time: new Date(t * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    ma: data.strategies[0].equity[i],
    rsi: data.strategies[1].equity[i],
    benchmark: data.benchmark[i],
    benchmark_btc: data.benchmark_btc[i],
  })) : []

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-md p-5 flex items-end gap-3">
        <div>
          <div className="text-xs text-gray-400 mb-1">종목</div>
          <MarketSelect market={market} setMarket={setMarket} tickers={tickers} />
        </div>
        <button onClick={run} disabled={loading}
          className="px-4 py-2 rounded-md bg-brand-500 text-white text-sm font-medium cursor-pointer hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {loading ? '실행 중…' : '비교 실행'}
        </button>
        <div className="text-xs text-gray-400 ml-auto">최근 200일 · 거래비용 5bps</div>
      </div>

      {loading && !data ? <PageLoading /> : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.strategies.map((s, i) => (
              <MetricCard key={s.name} label={s.name}
                value={(s.total_return >= 0 ? '+' : '') + s.total_return.toFixed(2) + '%'}
                color={s.total_return >= 0 ? 'text-red-500' : 'text-blue-500'}
                sub={i === 0 ? '추세추종' : '평균회귀'} />
            ))}
            <MetricCard label="매수보유" value={(data.benchmark.at(-1) - 100).toFixed(2) + '%'} sub="같은 종목" />
            <MetricCard label="BTC 보유" value={(data.benchmark_btc.at(-1) - 100).toFixed(2) + '%'} sub="시장 대표" />
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <div className="text-sm font-semibold text-gray-700 mb-0.5">전략별 자산 곡선</div>
            <div className="text-xs text-gray-400 mb-4">초기 100 기준 · MA(파랑)·RSI(주황) vs 매수보유·BTC(점선)</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={Math.floor(chartData.length / 8)} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ fontSize: 12 }}
                  formatter={(v, n) => [v.toFixed(2), n === 'ma' ? 'MA 크로스' : n === 'rsi' ? 'RSI 역추세' : n === 'benchmark' ? '매수보유' : 'BTC 보유']} />
                <ReferenceLine y={100} stroke="#e5e7eb" />
                <Line type="monotone" dataKey="ma" stroke="#1763b6" strokeWidth={2} dot={false} name="ma" />
                <Line type="monotone" dataKey="rsi" stroke="#e0913c" strokeWidth={2} dot={false} name="rsi" />
                <Line type="monotone" dataKey="benchmark" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="benchmark" />
                <Line type="monotone" dataKey="benchmark_btc" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="2 2" dot={false} name="benchmark_btc" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

// 워크포워드 — in-sample에서 MA 파라미터를 고른 뒤 out-of-sample 구간에서만 성과를 집계(과최적화 검증).
function WalkForwardBody({ market, setMarket, tickers }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const run = () => { setLoading(true); runWalkForward({ market, count: 300, n_splits: 4 }).then(setData).finally(() => setLoading(false)) }
  useEffect(() => { Promise.resolve().then(run) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = data ? data.equity.map(e => ({
    time: new Date(e.time * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    value: e.value,
  })) : []

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-md p-5 flex items-end gap-3">
        <div>
          <div className="text-xs text-gray-400 mb-1">종목</div>
          <MarketSelect market={market} setMarket={setMarket} tickers={tickers} />
        </div>
        <button onClick={run} disabled={loading}
          className="px-4 py-2 rounded-md bg-brand-500 text-white text-sm font-medium cursor-pointer hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {loading ? '실행 중…' : '워크포워드 실행'}
        </button>
        <div className="text-xs text-gray-400 ml-auto flex items-center gap-1">
          최근 300일 · 4분할
          <InfoTooltip width="w-80">전체 기간을 4구간으로 나눠, 각 구간 직전까지의 데이터(<b>in-sample</b>)에서 MA 파라미터를 그리드서치로 고르고, 그 다음 구간(<b>out-of-sample</b>)에서만 성과를 집계합니다. 인샘플 백테스트가 부풀려 보이는 <b>과최적화</b>를 걸러, 미래에도 통하는지를 봅니다.</InfoTooltip>
        </div>
      </div>

      {loading && !data ? <PageLoading /> : data && (data.n_splits === 0 ? (
        <div className="bg-white border border-gray-200 rounded-md p-10 text-center text-sm text-gray-400">데이터가 부족합니다</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="OOS 누적 수익률"
              value={(data.total_return >= 0 ? '+' : '') + data.total_return.toFixed(2) + '%'}
              color={data.total_return >= 0 ? 'text-red-500' : 'text-blue-500'}
              sub="out-of-sample만 집계" />
            <MetricCard label="분할 수" value={data.n_splits + '개'} sub="롤링 윈도우" />
            <MetricCard label="평균 OOS 수익"
              value={(data.folds.reduce((s, f) => s + f.oos_return, 0) / data.folds.length).toFixed(2) + '%'}
              sub="구간 평균" />
            <MetricCard label="승 구간"
              value={data.folds.filter(f => f.oos_return > 0).length + ' / ' + data.folds.length}
              sub="OOS 수익 > 0" />
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <div className="text-sm font-semibold text-gray-700 mb-0.5">Out-of-Sample 자산 곡선</div>
            <div className="text-xs text-gray-400 mb-4">각 구간을 직전 데이터로 최적화한 파라미터로만 평가해 이어붙임 (초기 100)</div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={Math.floor(chartData.length / 8)} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={v => [v.toFixed(2), 'OOS 자산']} />
                <ReferenceLine y={100} stroke="#e5e7eb" />
                <Line type="monotone" dataKey="value" stroke="#1763b6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="value" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">구간별 선택 파라미터 · OOS 성과</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-400">
                  <th className="px-4 py-2 text-left font-medium">구간</th>
                  <th className="px-4 py-2 text-right font-medium">선택 MA (단기/장기)</th>
                  <th className="px-4 py-2 text-right font-medium">OOS 종료일</th>
                  <th className="px-4 py-2 text-right font-medium">OOS 수익률</th>
                </tr>
              </thead>
              <tbody>
                {data.folds.map((f, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-4 py-2 text-gray-600">#{i + 1}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">MA({f.fast}, {f.slow})</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{new Date(f.test_end * 1000).toLocaleDateString('ko-KR')}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${f.oos_return >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                      {(f.oos_return >= 0 ? '+' : '') + f.oos_return.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ))}
    </div>
  )
}

// 단일 종목 전략(MA/RSI) 설정 + 결과 — 기존 본문을 그대로 분리.
function SingleStrategyBody({ strategy, market, setMarket, tickers, params, setParam, loading, handleRun, result, equityData, tradeData }) {
  return (
    <div className="space-y-4">
      {/* 설정 패널 */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="grid grid-cols-3 gap-4">
          {/* 종목 */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">종목</label>
            <select
              value={market}
              onChange={e => setMarket(e.target.value)}
              className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm cursor-pointer focus:outline-none focus:border-brand-400"
            >
              {tickers.map(t => (
                <option key={t.market} value={t.market}>{t.market.replace('KRW-', '')} {t.korean_name}</option>
              ))}
            </select>
          </div>

          {/* 전략 파라미터 */}
          {strategy === 'ma' ? (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">단기 MA</label>
                <input type="number" value={params.fast} min={2} max={50}
                  onChange={e => setParam('fast', e.target.value)}
                  className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">장기 MA</label>
                <input type="number" value={params.slow} min={5} max={200}
                  onChange={e => setParam('slow', e.target.value)}
                  className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">RSI 기간</label>
                <input type="number" value={params.period} min={5} max={30}
                  onChange={e => setParam('period', e.target.value)}
                  className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1.5 block">과매도</label>
                  <input type="number" value={params.oversold} min={10} max={45}
                    onChange={e => setParam('oversold', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1.5 block">과매수</label>
                  <input type="number" value={params.overbought} min={55} max={90}
                    onChange={e => setParam('overbought', e.target.value)}
                    className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-4 mt-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">데이터 기간 (일봉 캔들 수)</label>
            <input type="number" value={params.count} min={60} max={500}
              onChange={e => setParam('count', e.target.value)}
              className="border border-gray-200 rounded px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">거래비용 (편도 bps, 1bps=0.01%)</label>
            <input type="number" value={params.fee} min={0} max={100} step={1}
              onChange={e => setParam('fee', e.target.value)}
              title="매매마다 차감하는 편도 수수료. 업비트 KRW 마켓 ~5bps(0.05%)"
              className="border border-gray-200 rounded px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:border-brand-400"
            />
          </div>
          <button
            onClick={handleRun}
            disabled={loading}
            className="mt-5 px-6 py-1.5 bg-brand-500 text-white text-sm font-medium rounded cursor-pointer hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '실행 중...' : '백테스트 실행'}
          </button>
        </div>
      </div>

      {loading && <Spinner />}

      {result && !loading && (
        <>
          {/* 성과 지표 — 거래비용 차감 후. 알파 = 전략 − 매수보유(buy&hold) */}
          {(() => {
            const alpha = result.metrics.total_return - result.metrics.benchmark_return
            return (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <MetricCard
                  label="총 수익률"
                  value={(result.metrics.total_return >= 0 ? '+' : '') + result.metrics.total_return.toFixed(2) + '%'}
                  color={result.metrics.total_return >= 0 ? 'text-red-500' : 'text-blue-500'}
                  sub={`거래비용 ${result.metrics.fee_bps}bps 반영`}
                />
                <MetricCard
                  label="매수보유 (buy&hold)"
                  value={(result.metrics.benchmark_return >= 0 ? '+' : '') + result.metrics.benchmark_return.toFixed(2) + '%'}
                  color={result.metrics.benchmark_return >= 0 ? 'text-red-500' : 'text-blue-500'}
                  sub="같은 종목 단순 보유"
                />
                <MetricCard
                  label="BTC 보유"
                  value={(result.metrics.benchmark_btc_return >= 0 ? '+' : '') + result.metrics.benchmark_btc_return.toFixed(2) + '%'}
                  color={result.metrics.benchmark_btc_return >= 0 ? 'text-red-500' : 'text-blue-500'}
                  sub="시장 대표 보유"
                />
                <MetricCard
                  label="초과수익 (알파)"
                  value={(alpha >= 0 ? '+' : '') + alpha.toFixed(2) + '%p'}
                  color={raColor(alpha)}
                  sub="전략 − 매수보유"
                />
                <MetricCard label="최대 낙폭(MDD)" value={'-' + result.metrics.mdd.toFixed(2) + '%'} color="text-blue-500" />
                <MetricCard label="승률 · 거래" value={result.metrics.win_rate.toFixed(1) + '% · ' + result.metrics.trade_count + '회'} />
              </div>
            )
          })()}

          {/* 리스크 조정 수익률 (√365 연율화) */}
          <div className="grid grid-cols-3 gap-4">
            <MetricCard
              label="샤프 비율 (Sharpe)"
              value={result.metrics.sharpe.toFixed(2)}
              color={raColor(result.metrics.sharpe)}
              sub="평균 수익 ÷ 변동성 (높을수록 좋음, > 1 우수)"
            />
            <MetricCard
              label="소르티노 (Sortino)"
              value={result.metrics.sortino.toFixed(2)}
              color={raColor(result.metrics.sortino)}
              sub="평균 수익 ÷ 하방 변동성 (손실만 패널티)"
            />
            <MetricCard
              label="칼마 (Calmar)"
              value={result.metrics.calmar.toFixed(2)}
              color={raColor(result.metrics.calmar)}
              sub="연율화 수익률 ÷ MDD (낙폭 대비 효율)"
            />
          </div>

          {/* 자산 곡선 — 전략 vs 매수보유 벤치마크 */}
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <div className="text-sm font-semibold text-gray-700 mb-0.5">자산 곡선</div>
            <div className="text-xs text-gray-400 mb-4">초기 자본 100 기준 · 전략(파랑) vs 매수보유(회색 점선) vs BTC 보유(주황 점선)</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={equityData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={Math.floor(equityData.length / 8)} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip formatter={(v, n) => [v.toFixed(2), n === 'benchmark' ? '매수보유' : n === 'benchmark_btc' ? 'BTC 보유' : '전략']} contentStyle={{ fontSize: 12 }} />
                <ReferenceLine y={100} stroke="#e5e7eb" />
                <Line type="monotone" dataKey="value" stroke="#1763b6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="value" />
                <Line type="monotone" dataKey="benchmark" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="benchmark" />
                <Line type="monotone" dataKey="benchmark_btc" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="2 2" dot={false} name="benchmark_btc" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 거래 내역 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-md p-5">
              <div className="text-sm font-semibold text-gray-700 mb-0.5">거래별 손익</div>
              <div className="text-xs text-gray-400 mb-4">매도 기준 거래별 손익률 (%)</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={tradeData} margin={{ top: 4, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="time" hide />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => v + '%'} />
                  <Tooltip formatter={v => [v.toFixed(2) + '%', '손익률']} contentStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="#e5e7eb" />
                  <Bar dataKey="pnl" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                    {tradeData.map((t, i) => <Cell key={i} fill={t.pnl >= 0 ? '#ef4444' : '#3b82f6'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">거래 내역</div>
              <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-400">
                      <th className="px-3 py-2 text-left font-medium">날짜</th>
                      <th className="px-3 py-2 text-center font-medium">구분</th>
                      <th className="px-3 py-2 text-right font-medium">가격</th>
                      <th className="px-3 py-2 text-right font-medium">손익률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-3 py-1.5 text-gray-400">
                          {new Date(t.time * 1000).toLocaleDateString('ko-KR')}
                        </td>
                        <td className={`px-3 py-1.5 text-center font-medium ${t.side === 'BUY' ? 'text-red-500' : 'text-blue-500'}`}>
                          {t.side === 'BUY' ? '매수' : '매도'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-700">{t.price.toLocaleString()}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${t.pnl > 0 ? 'text-red-500' : t.pnl < 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                          {t.side === 'SELL' ? (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(2) + '%' : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </>
      )}

      {!result && !loading && (
        <div className="bg-white border border-gray-200 rounded-md py-16 text-center text-sm text-gray-400">
          설정을 입력하고 백테스트를 실행하세요
        </div>
      )}
    </div>
  )
}

const REBAL_OPTIONS = [
  { v: 0,  label: '매수보유' },
  { v: 7,  label: '7일 리밸런스' },
  { v: 30, label: '30일 리밸런스' },
]

// 포트폴리오 보유 백테스트 — 종목을 비중대로 들었을 때의 자산 곡선.
// 종목·비중 출처 우선순위: preset(포트폴리오 최적화에서 넘어온 ★/◆ 비중) > 분석 카트 > 기본 3종.
// (동선 통합 — 엔지니어링노트 §28)
function PortfolioBacktest({ tickers, preset }) {
  const init = preset?.markets?.length
    ? preset.markets.slice(0, 10)
    : ['KRW-BTC', 'KRW-ETH', 'KRW-XRP']
  const [markets, setMarkets] = useState(init)
  // 비중(%) — preset이 있으면 최적 비중, 없으면 균등(균등이면 동일가중 벤치마크와 곡선이 겹침·정상).
  const [wmap, setWmap] = useState(() =>
    preset?.markets?.length && preset?.weights?.length
      ? Object.fromEntries(preset.markets.map((m, i) => [m, preset.weights[i] ?? 0]))
      : Object.fromEntries(init.map(m => [m, +(100 / init.length).toFixed(1)]))
  )
  const [rebalance, setRebalance] = useState(0)
  const [count, setCount] = useState(180)
  const [fee, setFee] = useState(5)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const nmap = Object.fromEntries(tickers.map(t => [t.market, t.korean_name]))

  function equalize(ms) {
    const w = +(100 / ms.length).toFixed(1)
    setWmap(Object.fromEntries(ms.map(m => [m, w])))
  }
  function addMarket(m) {
    if (!m || markets.includes(m) || markets.length >= 10) return
    const next = [...markets, m]; setMarkets(next); equalize(next)
  }
  function removeMarket(m) {
    const next = markets.filter(x => x !== m); setMarkets(next); equalize(next)
  }

  async function run() {
    if (markets.length < 1) return
    setLoading(true)
    try {
      const weights = markets.map(m => wmap[m] ?? 0)
      const data = await runPortfolio({ markets, weights, count, rebalance_days: rebalance, fee_bps: fee })
      setResult(data)
    } finally { setLoading(false) }
  }
  useEffect(() => {
    Promise.resolve().then(run)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const equityData = result?.equity.map(e => ({
    time: new Date(e.time * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    value: e.value, benchmark: e.benchmark,
  })) ?? []

  return (
    <div className="space-y-4">
      {/* 구성 */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 mb-3">포트폴리오 구성</div>
        <div className="space-y-1.5 mb-3">
          {markets.map((m, i) => (
            <div key={m} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
              <span className="w-28 text-sm text-gray-700">{m.replace('KRW-', '')} <span className="text-gray-400 text-xs">{nmap[m]}</span></span>
              <input type="number" min={0} max={100} value={wmap[m] ?? 0}
                onChange={e => setWmap(prev => ({ ...prev, [m]: Number(e.target.value) }))}
                className="w-20 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand-400" />
              <span className="text-xs text-gray-400">%</span>
              <button onClick={() => removeMarket(m)} className="text-gray-300 hover:text-red-500 text-lg leading-none cursor-pointer ml-1">×</button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value="" onChange={e => addMarket(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-500 cursor-pointer focus:outline-none focus:border-brand-400">
            <option value="">+ 종목 추가</option>
            {tickers.filter(t => !markets.includes(t.market)).slice(0, 80).map(t => (
              <option key={t.market} value={t.market}>{t.market.replace('KRW-', '')} · {t.korean_name}</option>
            ))}
          </select>
          <button onClick={() => equalize(markets)} className="px-2.5 py-1.5 text-xs rounded bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer">균등 비중</button>
          <select value={rebalance} onChange={e => setRebalance(Number(e.target.value))}
            className="border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-600 cursor-pointer focus:outline-none focus:border-brand-400">
            {REBAL_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <input type="number" value={count} min={30} max={500} onChange={e => setCount(Number(e.target.value))}
            title="일봉 기간" className="w-24 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-brand-400" />
          <input type="number" value={fee} min={0} max={100} onChange={e => setFee(Number(e.target.value))}
            title="편도 거래비용(bps) · 진입+리밸런스 회전에 차감" className="w-20 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-brand-400" placeholder="bps" />
          <button onClick={run} disabled={loading || markets.length < 1}
            className="px-5 py-1.5 bg-brand-500 text-white text-sm font-medium rounded cursor-pointer hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {loading ? '실행 중...' : '백테스트 실행'}
          </button>
        </div>
        <div className="text-[11px] text-gray-400 mt-2">※ 비중 합은 자동 정규화 · 마지막 입력칸 = 편도 거래비용(bps, 진입+리밸런스 회전에 차감) · 균등 비중이면 동일가중 벤치마크와 곡선이 겹칩니다.</div>
      </div>

      {loading && <Spinner />}

      {result && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="총 수익률" value={(result.total_return >= 0 ? '+' : '') + result.total_return.toFixed(2) + '%'} color={result.total_return >= 0 ? 'text-red-500' : 'text-blue-500'} />
            <MetricCard label="동일가중 벤치마크" value={(result.benchmark_return >= 0 ? '+' : '') + result.benchmark_return.toFixed(2) + '%'} color={result.benchmark_return >= 0 ? 'text-red-500' : 'text-blue-500'} />
            <MetricCard label="최대 낙폭(MDD)" value={'-' + result.mdd.toFixed(2) + '%'} color="text-blue-500" />
            <MetricCard label="샤프" value={result.sharpe.toFixed(2)} color={raColor(result.sharpe)} />
            <MetricCard label="연율 변동성" value={result.volatility.toFixed(1) + '%'} />
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-5">
            <div className="text-sm font-semibold text-gray-700 mb-0.5">자산 곡선</div>
            <div className="text-xs text-gray-400 mb-4">초기 100 기준 · 포트폴리오 vs 동일가중 벤치마크</div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={equityData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={Math.floor(equityData.length / 8)} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip formatter={(v, n) => [v.toFixed(2), n === 'value' ? '포트폴리오' : '벤치마크']} contentStyle={{ fontSize: 12 }} />
                <ReferenceLine y={100} stroke="#e5e7eb" />
                <Line type="monotone" dataKey="value" stroke="#1763b6" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="benchmark" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-5">
            <div className="text-sm font-semibold text-gray-700 mb-3">종목별 기여</div>
            <div className="space-y-2">
              {result.contributions.map((c, i) => (
                <div key={c.market} className="flex items-center gap-3 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
                  <span className="w-32 text-gray-700">{c.market.replace('KRW-', '')} <span className="text-gray-400 text-xs">{c.korean_name}</span></span>
                  <span className="w-20 text-xs text-gray-500">비중 {(c.weight * 100).toFixed(1)}%</span>
                  <span className={`w-24 text-right font-medium tabular-nums ${c.asset_return >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                    {(c.asset_return >= 0 ? '+' : '') + c.asset_return.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

        </>
      )}
    </div>
  )
}
