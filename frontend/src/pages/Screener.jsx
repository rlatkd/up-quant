import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTickers } from '../hooks/useTickers'
import { getCoinStats } from '../api/analysis'

const FIELDS = [
  { key: 'change_rate',   label: '등락률',       unit: '%'  },
  { key: 'acc_trade_24h', label: '거래대금',      unit: '억' },
  { key: 'volatility',    label: '변동성(30일)',  unit: '%'  },
  { key: 'return_1m',     label: '1개월 수익률',  unit: '%'  },
  { key: 'w52_pos',       label: '52주 위치',     unit: '%'  },
]

const OPS = ['>', '<', '>=', '<=']

const PRESETS = [
  { label: '급등주',   conditions: [{ field: 'change_rate', op: '>', value: '5' }] },
  { label: '고변동성', conditions: [{ field: 'volatility',  op: '>', value: '4' }] },
  { label: '52주 신고가 근접', conditions: [{ field: 'w52_pos', op: '>=', value: '90' }] },
  { label: '침체 저가권', conditions: [{ field: 'w52_pos', op: '<=', value: '20' }, { field: 'change_rate', op: '<', value: '-3' }] },
]

let _uid = 0

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )
}

export default function Screener() {
  const { tickers, loading: tLoading } = useTickers()
  const [stats, setStats]           = useState([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [conditions, setConditions]  = useState([])
  const [results, setResults]        = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    getCoinStats().then(setStats).finally(() => setStatsLoading(false))
  }, [])

  const merged = useMemo(() => {
    if (!tickers.length || !stats.length) return []
    const statsMap = Object.fromEntries(stats.map(s => [s.market, s]))
    return tickers.map(t => {
      const s = statsMap[t.market] ?? {}
      const range  = (t.w52_high ?? 0) - (t.w52_low ?? 0)
      const w52_pos = range > 0 ? Math.round((t.trade_price - (t.w52_low ?? 0)) / range * 100) : 50
      return {
        market:       t.market,
        korean_name:  t.korean_name,
        trade_price:  t.trade_price,
        change_rate:  t.change_rate,
        acc_trade_24h: Math.round((t.acc_trade_price_24h ?? 0) / 1e8),
        volatility:   s.volatility   ?? 0,
        return_1m:    s.return_1m    ?? 0,
        w52_pos,
      }
    })
  }, [tickers, stats])

  function addCondition(field = 'change_rate', op = '>', value = '') {
    setConditions(prev => [...prev, { id: _uid++, field, op, value }])
  }

  function removeCondition(id) {
    setConditions(prev => prev.filter(c => c.id !== id))
  }

  function updateCondition(id, patch) {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  function applyPreset(preset) {
    setConditions(preset.conditions.map(c => ({ id: _uid++, ...c })))
    setResults(null)
  }

  function handleRun() {
    const filtered = merged.filter(coin =>
      conditions.every(cond => {
        const v = parseFloat(cond.value)
        if (isNaN(v)) return true
        const actual = coin[cond.field]
        if      (cond.op === '>') return actual >  v
        else if (cond.op === '<') return actual <  v
        else if (cond.op === '>=') return actual >= v
        else                      return actual <= v
      })
    )
    setResults(filtered)
  }

  function handleReset() {
    setConditions([])
    setResults(null)
  }

  if (tLoading || statsLoading) return <Spinner />

  return (
    <div className="space-y-4">
      {/* 조건 설정 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="text-sm font-semibold text-gray-700 mb-3">스크리닝 조건</div>

        {/* 프리셋 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="px-3 py-1 text-xs border border-gray-200 rounded-full text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* 조건 행 */}
        <div className="space-y-2 mb-4">
          {conditions.length === 0 && (
            <div className="text-sm text-gray-400 py-2">아래 버튼으로 조건을 추가하거나 프리셋을 선택하세요</div>
          )}
          {conditions.map(cond => (
            <div key={cond.id} className="flex items-center gap-2">
              <select
                value={cond.field}
                onChange={e => updateCondition(cond.id, { field: e.target.value })}
                className="border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
              >
                {FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <select
                value={cond.op}
                onChange={e => updateCondition(cond.id, { op: e.target.value })}
                className="border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
              >
                {OPS.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <input
                type="number"
                value={cond.value}
                onChange={e => updateCondition(cond.id, { value: e.target.value })}
                placeholder="값"
                className="w-24 border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
              />
              <span className="text-xs text-gray-400 w-4">{FIELDS.find(f => f.key === cond.field)?.unit}</span>
              <button
                onClick={() => removeCondition(cond.id)}
                className="text-gray-300 hover:text-red-400 transition-colors text-xl leading-none ml-1"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => addCondition()}
            className="px-4 py-1.5 border border-gray-200 text-sm text-gray-600 rounded hover:bg-gray-50 transition-colors"
          >
            + 조건 추가
          </button>
          <button
            onClick={handleRun}
            disabled={conditions.length === 0}
            className="px-6 py-1.5 bg-indigo-500 text-white text-sm font-medium rounded hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            스크리닝 실행
          </button>
          {(conditions.length > 0 || results !== null) && (
            <button
              onClick={handleReset}
              className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 결과 */}
      {results !== null && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">스크리닝 결과</div>
            <div className="text-xs text-gray-400">
              {results.length > 0 ? `${results.length}개 종목 매칭` : '매칭 없음'}
            </div>
          </div>

          {results.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">조건에 맞는 종목이 없습니다</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-400 font-medium">
                  <th className="px-4 py-2.5 text-left">종목</th>
                  <th className="px-4 py-2.5 text-right">현재가</th>
                  <th className="px-4 py-2.5 text-right">등락률</th>
                  <th className="px-4 py-2.5 text-right">거래대금</th>
                  <th className="px-4 py-2.5 text-right">변동성</th>
                  <th className="px-4 py-2.5 text-right">1개월 수익률</th>
                  <th className="px-4 py-2.5 text-right">52주 위치</th>
                </tr>
              </thead>
              <tbody>
                {results.map(coin => (
                  <tr
                    key={coin.market}
                    onClick={() => navigate(`/coins/${coin.market}`)}
                    className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{coin.market.replace('KRW-', '')}</div>
                      <div className="text-xs text-gray-400">{coin.korean_name}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">
                      {coin.trade_price.toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${
                      coin.change_rate > 0 ? 'text-red-500' : coin.change_rate < 0 ? 'text-blue-500' : 'text-gray-400'
                    }`}>
                      {(coin.change_rate > 0 ? '+' : '') + coin.change_rate.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {coin.acc_trade_24h.toLocaleString()}억
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {coin.volatility.toFixed(2)}%
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${
                      coin.return_1m > 0 ? 'text-red-500' : coin.return_1m < 0 ? 'text-blue-500' : 'text-gray-400'
                    }`}>
                      {(coin.return_1m > 0 ? '+' : '') + coin.return_1m.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-400 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, coin.w52_pos))}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{coin.w52_pos}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {results === null && (
        <div className="bg-white border border-gray-200 rounded-lg py-16 text-center text-sm text-gray-400">
          조건을 설정하고 스크리닝을 실행하세요
        </div>
      )}
    </div>
  )
}
