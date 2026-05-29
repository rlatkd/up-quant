import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'
import { useTickers } from '../hooks/useTickers'
import { runMaCross, runRsi } from '../api/backtest'
import InfoTooltip from '../components/InfoTooltip'
import PageHeader from '../components/ui/PageHeader'

const STRATEGIES = [
  { key: 'ma',  label: 'MA 크로스' },
  { key: 'rsi', label: 'RSI 역추세' },
]

function MetricCard({ label, value, color = 'text-gray-800' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md px-5 py-4 text-center">
      <div className="text-xs text-gray-400 mb-1.5">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )
}

export default function Backtest() {
  const { tickers, loading: tLoading } = useTickers()
  const [strategy, setStrategy] = useState('ma')
  const [market,   setMarket]   = useState('KRW-BTC')
  const [params,   setParams]   = useState({ fast: 5, slow: 20, period: 14, oversold: 30, overbought: 70, count: 200 })
  const [result,   setResult]   = useState(null)
  const [loading,  setLoading]  = useState(false)

  function setParam(key, val) {
    setParams(prev => ({ ...prev, [key]: Number(val) }))
  }

  async function handleRun() {
    setLoading(true)
    try {
      const p = { market, count: params.count }
      const data = strategy === 'ma'
        ? await runMaCross({ ...p, fast: params.fast, slow: params.slow })
        : await runRsi({ ...p, period: params.period, oversold: params.oversold, overbought: params.overbought })
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  // 진입 즉시 기본 전략(KRW-BTC·MA 크로스) 결과를 보여준다 (마운트 후 마이크로태스크 — 동기 setState 회피)
  useEffect(() => {
    Promise.resolve().then(handleRun)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (tLoading) return <Spinner />

  const equityData = result?.equity.map(e => ({
    time: new Date(e.time * 1000).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    value: e.value,
  })) ?? []

  const tradeData = (result?.trades ?? []).filter(t => t.side === 'SELL')

  return (
    <div className="space-y-4">
      <PageHeader title="전략 백테스트" description="과거 일봉으로 매매 전략 성과를 시뮬레이션" />

      {/* 설정 패널 */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 mb-4">
          백테스트 설정
          <InfoTooltip>
            과거 일봉으로 매매 전략을 시뮬레이션합니다. 전략(MA 크로스 / RSI 역추세)·종목·파라미터를 정하고 [백테스트 실행]을 누르면 자산 곡선·총수익률·MDD(최대 낙폭)·승률·거래 내역이 나옵니다. 기본값(KRW-BTC·MA 크로스)으로 결과가 미리 실행돼 있습니다.
          </InfoTooltip>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {/* 전략 */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">전략</label>
            <div className="flex gap-1">
              {STRATEGIES.map(s => (
                <button
                  key={s.key}
                  onClick={() => setStrategy(s.key)}
                  className={`flex-1 py-1.5 text-xs rounded font-medium cursor-pointer transition-colors ${
                    strategy === s.key ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

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
          {/* 성과 지표 */}
          <div className="grid grid-cols-4 gap-4">
            <MetricCard
              label="총 수익률"
              value={(result.metrics.total_return >= 0 ? '+' : '') + result.metrics.total_return.toFixed(2) + '%'}
              color={result.metrics.total_return >= 0 ? 'text-red-500' : 'text-blue-500'}
            />
            <MetricCard label="최대 낙폭(MDD)" value={'-' + result.metrics.mdd.toFixed(2) + '%'} color="text-blue-500" />
            <MetricCard label="승률" value={result.metrics.win_rate.toFixed(1) + '%'} />
            <MetricCard label="총 거래 횟수" value={result.metrics.trade_count + '회'} />
          </div>

          {/* 자산 곡선 */}
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <div className="text-sm font-semibold text-gray-700 mb-0.5">자산 곡선</div>
            <div className="text-xs text-gray-400 mb-4">초기 자본 100 기준</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={equityData} margin={{ top: 4, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={Math.floor(equityData.length / 8)} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip formatter={v => [v.toFixed(2), '자산']} contentStyle={{ fontSize: 12 }} />
                <ReferenceLine y={100} stroke="#e5e7eb" />
                <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
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
