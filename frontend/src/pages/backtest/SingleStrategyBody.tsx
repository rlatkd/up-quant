import { useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'
import { MetricCard, PngButton, Spinner } from './parts'
import { raColor } from './helpers'
import Caveat from '../../components/Caveat'

// 단일 종목 전략(MA/RSI) 설정 + 결과.
export default function SingleStrategyBody({ strategy, market, setMarket, tickers, params, setParam, loading, handleRun, result, equityData, tradeData }) {
  const eqRef = useRef(null)
  return (
    <div className="space-y-4">
      {/* 설정 패널 */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">종목</label>
            <select value={market} onChange={e => setMarket(e.target.value)}
              className="w-full border border-gray-200 dark:border-[#2c3850] rounded px-2.5 py-1.5 text-sm cursor-pointer focus:outline-none focus:border-brand-400">
              {tickers.map(t => (
                <option key={t.market} value={t.market}>{t.market.replace('KRW-', '')} {t.korean_name}</option>
              ))}
            </select>
          </div>

          {strategy === 'ma' ? (
            <>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">단기 MA</label>
                <input type="number" value={params.fast} min={2} max={50} onChange={e => setParam('fast', e.target.value)}
                  className="w-full border border-gray-200 dark:border-[#2c3850] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">장기 MA</label>
                <input type="number" value={params.slow} min={5} max={200} onChange={e => setParam('slow', e.target.value)}
                  className="w-full border border-gray-200 dark:border-[#2c3850] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">RSI 기간</label>
                <input type="number" value={params.period} min={5} max={30} onChange={e => setParam('period', e.target.value)}
                  className="w-full border border-gray-200 dark:border-[#2c3850] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">과매도</label>
                  <input type="number" value={params.oversold} min={10} max={45} onChange={e => setParam('oversold', e.target.value)}
                    className="w-full border border-gray-200 dark:border-[#2c3850] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">과매수</label>
                  <input type="number" value={params.overbought} min={55} max={90} onChange={e => setParam('overbought', e.target.value)}
                    className="w-full border border-gray-200 dark:border-[#2c3850] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400" />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-4 mt-4">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">데이터 기간 (일봉 캔들 수)</label>
            <input type="number" value={params.count} min={60} max={500} onChange={e => setParam('count', e.target.value)}
              className="border border-gray-200 dark:border-[#2c3850] rounded px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:border-brand-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">거래비용 (편도 bps, 1bps=0.01%)</label>
            <input type="number" value={params.fee} min={0} max={100} step={1} onChange={e => setParam('fee', e.target.value)}
              title="매매마다 차감하는 편도 수수료. 업비트 KRW 마켓 ~5bps(0.05%)"
              className="border border-gray-200 dark:border-[#2c3850] rounded px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:border-brand-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">
              변동성 타게팅 (연율, 0=올인)
              <span className="text-gray-300 dark:text-gray-600 ml-1" title="진입 시 직전 20일 실현변동성으로 비중을 축소(목표/실현, 상한 100%). 올인/올아웃 토이를 보완. 예: 0.6 = 연 60% 목표">ⓘ</span>
            </label>
            <input type="number" value={params.targetVol} min={0} max={2} step={0.1} onChange={e => setParam('targetVol', e.target.value)}
              placeholder="0.6"
              className="border border-gray-200 dark:border-[#2c3850] rounded px-2.5 py-1.5 text-sm w-32 focus:outline-none focus:border-brand-400" />
          </div>
          <button onClick={handleRun} disabled={loading}
            className="mt-5 px-6 py-1.5 bg-brand-500 text-white text-sm font-medium rounded cursor-pointer hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {loading ? '실행 중...' : '백테스트 실행'}
          </button>
        </div>
      </div>

      {loading && <Spinner />}

      {result && !loading && (
        <>
          {(() => {
            const alpha = result.metrics.total_return - result.metrics.benchmark_return
            return (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <MetricCard label="총 수익률"
                  value={(result.metrics.total_return >= 0 ? '+' : '') + result.metrics.total_return.toFixed(2) + '%'}
                  color={result.metrics.total_return >= 0 ? 'text-red-500' : 'text-blue-500'}
                  sub={`수수료 ${result.metrics.fee_bps}bps + 슬리피지 ${result.metrics.slippage_bps}bps${result.metrics.target_vol > 0 ? ` · 평균비중 ${result.metrics.avg_position}%` : ''}`} />
                <MetricCard label="매수보유 (buy&hold)"
                  value={(result.metrics.benchmark_return >= 0 ? '+' : '') + result.metrics.benchmark_return.toFixed(2) + '%'}
                  color={result.metrics.benchmark_return >= 0 ? 'text-red-500' : 'text-blue-500'} sub="같은 종목 단순 보유" />
                <MetricCard label="BTC 보유"
                  value={(result.metrics.benchmark_btc_return >= 0 ? '+' : '') + result.metrics.benchmark_btc_return.toFixed(2) + '%'}
                  color={result.metrics.benchmark_btc_return >= 0 ? 'text-red-500' : 'text-blue-500'} sub="시장 대표 보유" />
                <MetricCard label="초과수익 (알파)"
                  value={(alpha >= 0 ? '+' : '') + alpha.toFixed(2) + '%p'} color={raColor(alpha)} sub="전략 − 매수보유" />
                <MetricCard label="최대 낙폭(MDD)" value={'-' + result.metrics.mdd.toFixed(2) + '%'} color="text-blue-500" />
                <MetricCard label="승률 · 거래" value={result.metrics.win_rate.toFixed(1) + '% · ' + result.metrics.trade_count + '회'} />
              </div>
            )
          })()}

          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="샤프 비율 (Sharpe)" value={result.metrics.sharpe.toFixed(2)} color={raColor(result.metrics.sharpe)}
              sub="평균 수익 ÷ 변동성 (높을수록 좋음, > 1 우수)" />
            <MetricCard label="소르티노 (Sortino)" value={result.metrics.sortino.toFixed(2)} color={raColor(result.metrics.sortino)}
              sub="평균 수익 ÷ 하방 변동성 (손실만 패널티)" />
            <MetricCard label="칼마 (Calmar)" value={result.metrics.calmar.toFixed(2)} color={raColor(result.metrics.calmar)}
              sub="연율화 수익률 ÷ MDD (낙폭 대비 효율)" />
          </div>

          <Caveat kind="backtest" />

          <div ref={eqRef} className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">자산 곡선</div>
              <PngButton targetRef={eqRef} name="upquant-backtest.png" />
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">초기 자본 100 기준 · 전략(파랑) vs 매수보유(회색 점선) vs BTC 보유(주황 점선)</div>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-0.5">거래별 손익</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">매도 기준 거래별 손익률 (%)</div>
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

            <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-[#232d40] text-sm font-semibold text-gray-700 dark:text-gray-200">거래 내역</div>
              <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-[#141b29] text-gray-400 dark:text-gray-500">
                      <th className="px-3 py-2 text-left font-medium">날짜</th>
                      <th className="px-3 py-2 text-center font-medium">구분</th>
                      <th className="px-3 py-2 text-right font-medium">가격</th>
                      <th className="px-3 py-2 text-right font-medium">손익률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500">{new Date(t.time * 1000).toLocaleDateString('ko-KR')}</td>
                        <td className={`px-3 py-1.5 text-center font-medium ${t.side === 'BUY' ? 'text-red-500' : 'text-blue-500'}`}>
                          {t.side === 'BUY' ? '매수' : '매도'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-200">{t.price.toLocaleString()}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${t.pnl > 0 ? 'text-red-500' : t.pnl < 0 ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`}>
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
        <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md py-16 text-center text-sm text-gray-400 dark:text-gray-500">
          설정을 입력하고 백테스트를 실행하세요
        </div>
      )}
    </div>
  )
}
