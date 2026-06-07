import { useState, useEffect, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import PageLoading from '../../components/ui/PageLoading'
import InfoTooltip from '../../components/InfoTooltip'
import { runTsmom } from '../../api/backtest'
import { MetricCard, PngButton } from './parts'
import { raColor, signedPct } from './helpers'

// 시계열 모멘텀(추세추종) + 변동성 타게팅 + 국면/크래시 필터 — 각 종목이 '자기 과거' 대비 오르면 롱/현금.
const TSMOM_LOOKBACKS = [30, 60, 90]

export default function TsmomBody() {
  const [lookback, setLookback] = useState(60)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)
  const run = (lb = lookback) => { setLoading(true); runTsmom({ lookback: lb }).then(setData).finally(() => setLoading(false)) }
  useEffect(() => { Promise.resolve().then(() => run()) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = data ? data.equity.map(e => ({
    time: new Date(e.time * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    value: e.value, benchmark: e.benchmark,
  })) : []
  const alpha = data ? data.total_return - data.benchmark_return : 0

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5 flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">추세 룩백</div>
          <div className="flex gap-1">
            {TSMOM_LOOKBACKS.map(lb => (
              <button key={lb} onClick={() => { setLookback(lb); run(lb) }}
                className={`px-3 py-2 text-sm rounded font-medium cursor-pointer transition-colors ${
                  lookback === lb ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-[#222c3e] text-gray-500 dark:text-gray-400 hover:bg-gray-200'
                }`}>
                {lb}일
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => run()} disabled={loading}
          className="px-4 py-2 rounded-md bg-brand-500 text-white text-sm font-medium cursor-pointer hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {loading ? '실행 중…' : '재실행'}
        </button>
        <div className="text-xs text-gray-400 dark:text-gray-500 ml-auto flex items-center gap-1">
          거래대금 상위 30 · 주기 5일 · 거래비용 5bps
          <InfoTooltip width="w-96">각 종목이 <b>자기 과거 {lookback}일</b> 대비 오르면 매수, 내리면 현금(시계열 모멘텀, 12-1 skip 적용). 비중은 <b>변동성 역가중</b>, 총 익스포저는 <b>시장 약세·고변동 시 동적 축소</b>(모멘텀 크래시 방지·변동성 타게팅). 업비트 현물이라 롱/현금만, 스테이블 제외·종목당 상한 25%·턴오버 히스테리시스. 추세장에 강하고 <b>횡보·급반전장에 약합니다</b>. 학술: Moskowitz·Ooi·Pedersen 2012, Barroso·Santa-Clara 2015, Daniel·Moskowitz 2016, Moreira·Muir 2017.</InfoTooltip>
        </div>
      </div>

      {loading && !data ? <PageLoading /> : data && (data.n === 0 ? (
        <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-10 text-center text-sm text-gray-400 dark:text-gray-500">데이터가 부족합니다</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="전략 총수익률" value={signedPct(data.total_return)}
              color={data.total_return >= 0 ? 'text-red-500' : 'text-blue-500'} sub="추세추종 + 변동성 타게팅" />
            <MetricCard label="동일가중 매수보유" value={signedPct(data.benchmark_return)}
              color={data.benchmark_return >= 0 ? 'text-red-500' : 'text-blue-500'} sub="벤치마크" />
            <MetricCard label="초과수익 (알파)" value={(alpha >= 0 ? '+' : '') + alpha.toFixed(2) + '%p'}
              color={raColor(alpha)} sub="전략 − 벤치마크" />
            <MetricCard label="샤프 · MDD" value={data.sharpe.toFixed(2) + ' · -' + data.mdd.toFixed(1) + '%'} />
            <MetricCard label="평균 투자 비중" value={data.avg_exposure.toFixed(0) + '%'} sub="나머지는 현금(추세 약할 때 회피)" />
          </div>

          <div ref={ref} className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">자산 곡선 · 추세추종 vs 동일가중 매수보유</div>
              <PngButton targetRef={ref} name="upquant-tsmom.png" />
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">초기 100 기준 · 전략(파랑) vs 동일가중 매수보유(회색 점선)</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={Math.floor(chartData.length / 8)} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip formatter={(v, n) => [v.toFixed(2), n === 'value' ? '추세추종' : '매수보유']} contentStyle={{ fontSize: 12 }} />
                <ReferenceLine y={100} stroke="#e5e7eb" />
                <Line type="monotone" dataKey="value" stroke="#1763b6" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="benchmark" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-[#232d40] text-sm font-semibold text-gray-700 dark:text-gray-200">
              현재 보유 종목 <span className="text-xs font-normal text-gray-400 dark:text-gray-500">· 최신 추세 신호 + 변동성 역가중 비중</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#141b29] text-xs text-gray-400 dark:text-gray-500">
                  <th className="px-4 py-2 text-left font-medium">종목</th>
                  <th className="px-4 py-2 text-right font-medium">{lookback}일 추세</th>
                  <th className="px-4 py-2 text-right font-medium">비중</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map(h => (
                  <tr key={h.market} className="border-t border-gray-50 dark:border-[#232d40]">
                    <td className="px-4 py-1.5 text-gray-700 dark:text-gray-200">{h.market.replace('KRW-', '')} <span className="text-gray-400 dark:text-gray-500 text-xs">{h.korean_name}</span></td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-red-500">{signedPct(h.momentum)}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200">{h.weight.toFixed(1)}%</td>
                  </tr>
                ))}
                {data.holdings.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">추세 양(+)인 종목이 없습니다 — 전량 현금</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ))}
    </div>
  )
}
