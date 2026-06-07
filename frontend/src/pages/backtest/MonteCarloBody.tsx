import { useState, useEffect } from 'react'
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
  ComposedChart, Area,
} from 'recharts'
import PageLoading from '../../components/ui/PageLoading'
import InfoTooltip from '../../components/InfoTooltip'
import { runMonteCarlo } from '../../api/backtest'
import { MetricCard, MarketSelect } from './parts'
import { signedPct } from './helpers'

// 몬테카를로 — 과거 일간수익률을 부트스트랩해 미래 가격 경로 1000개를 생성, 백분위 부채꼴로 표시.
const MC_HORIZONS = [7, 30, 60, 90]

export default function MonteCarloBody({ market, setMarket, tickers }) {
  const [horizon, setHorizon] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const run = (h = horizon) => { setLoading(true); runMonteCarlo({ market, horizon: h }).then(setData).finally(() => setLoading(false)) }
  useEffect(() => { Promise.resolve().then(() => run()) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // 각 시점의 [p5,p95]·[p25,p75] 범위 Area + 중앙값 라인. recharts Area는 [low,high] 튜플 dataKey를 범위로 그린다.
  const chartData = data ? data.bands.map(b => ({
    day: b.day, outer: [b.p5, b.p95], inner: [b.p25, b.p75], median: b.p50,
  })) : []

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5 flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">종목</div>
          <MarketSelect market={market} setMarket={setMarket} tickers={tickers} />
        </div>
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">시뮬레이션 기간</div>
          <div className="flex gap-1">
            {MC_HORIZONS.map(h => (
              <button key={h} onClick={() => { setHorizon(h); run(h) }}
                className={`px-3 py-2 text-sm rounded font-medium cursor-pointer transition-colors ${
                  horizon === h ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-[#222c3e] text-gray-500 dark:text-gray-400 hover:bg-gray-200'
                }`}>
                {h}일
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => run()} disabled={loading}
          className="px-4 py-2 rounded-md bg-brand-500 text-white text-sm font-medium cursor-pointer hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {loading ? '실행 중…' : '재시뮬레이션'}
        </button>
        <div className="text-xs text-gray-400 dark:text-gray-500 ml-auto flex items-center gap-1">
          과거 180일 수익률 · 경로 1000개
          <InfoTooltip width="w-80">과거 일간수익률 분포에서 <b>복원추출(부트스트랩)</b>해 향후 {horizon}일 가격 경로를 1000개 생성합니다. 정규분포 가정 대신 실제 분포라 급등락 빈도(팻테일)가 보존됩니다. 부채꼴은 시나리오 분포 — 안쪽 진한 띠가 50%(25~75%) 구간, 바깥 연한 띠가 90%(5~95%) 구간, 가운데 선이 중앙값입니다. <b>과거가 미래에도 유효하다는 가정</b>이라 예측이 아닌 확률 분포입니다.</InfoTooltip>
        </div>
      </div>

      {loading && !data ? <PageLoading /> : data && (data.n_obs === 0 ? (
        <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-10 text-center text-sm text-gray-400 dark:text-gray-500">데이터가 부족합니다</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="중앙값 시나리오" value={signedPct(data.final_p50)}
              color={data.final_p50 >= 0 ? 'text-red-500' : 'text-blue-500'} sub={`${horizon}일 후 50%`} />
            <MetricCard label="비관 (하위 5%)" value={signedPct(data.final_p5)} color="text-blue-500" sub="최악 시나리오" />
            <MetricCard label="낙관 (상위 5%)" value={signedPct(data.final_p95)} color="text-red-500" sub="최선 시나리오" />
            <MetricCard label="손실 확률" value={data.prob_loss.toFixed(1) + '%'}
              color={data.prob_loss > 50 ? 'text-blue-500' : 'text-gray-700 dark:text-gray-200'} sub="원금 미만 비율" />
            <MetricCard label="기대 수익률" value={signedPct(data.expected_return)}
              color={data.expected_return >= 0 ? 'text-red-500' : 'text-blue-500'} sub="평균 시나리오" />
          </div>

          <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-0.5">미래 시나리오 분포 (몬테카를로 부채꼴)</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              현재가=100 기준 · 안쪽 진한 띠 = 50% 구간(25~75%) · 바깥 연한 띠 = 90% 구간(5~95%) · 가운데 선 = 중앙값 ·
              과거 일변동성 {data.daily_vol.toFixed(2)}% / 일평균 {signedPct(data.daily_mean)}
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={d => d + '일'} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} domain={['dataMin', 'dataMax']} />
                <Tooltip contentStyle={{ fontSize: 12 }}
                  formatter={(v, n) => {
                    if (n === 'median') return [v.toFixed(1), '중앙값']
                    if (Array.isArray(v)) return [`${v[0].toFixed(1)} ~ ${v[1].toFixed(1)}`, n === 'outer' ? '90% 구간' : '50% 구간']
                    return [v, n]
                  }}
                  labelFormatter={d => `${d}일 후`} />
                <ReferenceLine y={100} stroke="#cbd5e1" strokeDasharray="4 3" label={{ value: '원금', position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
                <Area dataKey="outer" stroke="none" fill="#1763b6" fillOpacity={0.1} isAnimationActive={false} />
                <Area dataKey="inner" stroke="none" fill="#1763b6" fillOpacity={0.22} isAnimationActive={false} />
                <Line dataKey="median" stroke="#1763b6" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      ))}
    </div>
  )
}
