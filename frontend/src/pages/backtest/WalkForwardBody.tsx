import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import PageLoading from '../../components/ui/PageLoading'
import InfoTooltip from '../../components/InfoTooltip'
import { runWalkForward } from '../../api/backtest'
import { MetricCard, MarketSelect } from './parts'

// 워크포워드 — in-sample에서 MA 파라미터를 고른 뒤 out-of-sample 구간에서만 성과를 집계(과최적화 검증).
export default function WalkForwardBody({ market, setMarket, tickers }) {
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
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5 flex items-end gap-3">
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">종목</div>
          <MarketSelect market={market} setMarket={setMarket} tickers={tickers} />
        </div>
        <button onClick={run} disabled={loading}
          className="px-4 py-2 rounded-md bg-brand-500 text-white text-sm font-medium cursor-pointer hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {loading ? '실행 중…' : '워크포워드 실행'}
        </button>
        <div className="text-xs text-gray-400 dark:text-gray-500 ml-auto flex items-center gap-1">
          최근 300일 · 4분할
          <InfoTooltip width="w-80">전체 기간을 4구간으로 나눠, 각 구간 직전까지의 데이터(<b>in-sample</b>)에서 MA 파라미터를 그리드서치로 고르고, 그 다음 구간(<b>out-of-sample</b>)에서만 성과를 집계합니다. 인샘플 백테스트가 부풀려 보이는 <b>과최적화</b>를 걸러, 미래에도 통하는지를 봅니다.</InfoTooltip>
        </div>
      </div>

      {loading && !data ? <PageLoading /> : data && (data.n_splits === 0 ? (
        <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-10 text-center text-sm text-gray-400 dark:text-gray-500">데이터가 부족합니다</div>
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
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#141b29] border border-gray-100 dark:border-[#232d40] rounded-md px-4 py-2.5">
            ⚠ <b className="font-medium">다중검정 보정</b> — 파라미터 {data.n_trials}개를 시도해 고른 최고 인샘플 샤프가 <b className="font-medium">순전히 우연일 확률 {(data.overfit_pvalue * 100).toFixed(0)}%</b>
            {data.overfit_pvalue < 0.1 ? ' (낮음 — 우연 아닐 가능성)' : data.overfit_pvalue < 0.3 ? ' (보통)' : ' (높음 — 과최적화 의심, 신뢰 주의)'}.
          </div>
          <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-0.5">Out-of-Sample 자산 곡선</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">각 구간을 직전 데이터로 최적화한 파라미터로만 평가해 이어붙임 (초기 100)</div>
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
          <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-[#232d40] text-sm font-semibold text-gray-700 dark:text-gray-200">구간별 선택 파라미터 · OOS 성과</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#141b29] text-xs text-gray-400 dark:text-gray-500">
                  <th className="px-4 py-2 text-left font-medium">구간</th>
                  <th className="px-4 py-2 text-right font-medium">선택 MA (단기/장기)</th>
                  <th className="px-4 py-2 text-right font-medium">OOS 종료일</th>
                  <th className="px-4 py-2 text-right font-medium">OOS 수익률</th>
                </tr>
              </thead>
              <tbody>
                {data.folds.map((f, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">#{i + 1}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">MA({f.fast}, {f.slow})</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">{new Date(f.test_end * 1000).toLocaleDateString('ko-KR')}</td>
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
