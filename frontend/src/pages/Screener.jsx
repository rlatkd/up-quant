import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTickers } from '../hooks/useTickers'
import { getCoinStats } from '../api/analysis'
import InfoTooltip from '../components/InfoTooltip'
import PageLoading from '../components/ui/PageLoading'

const FIELDS = [
  { key: 'change_rate',   label: '등락률',       unit: '%'  },
  { key: 'acc_trade_24h', label: '거래대금',      unit: '억' },
  { key: 'volatility',    label: '변동성(30일)',  unit: '%'  },
  { key: 'return_1m',     label: '1개월 수익률',  unit: '%'  },
  { key: 'w52_pos',       label: '52주 위치',     unit: '%'  },
  { key: 'btc_beta',      label: 'BTC 베타',      unit: '배' },
  { key: 'vol_surge',     label: '거래량 급증',   unit: '배' },
  { key: 'vol_zscore',    label: '변동성 z',      unit: 'σ'  },
]

const OPS = ['>', '<', '>=', '<=']

// KRW 마켓 15종목 기준으로 일반적인 날에도 결과가 비지 않도록 임계값 조정
const PRESETS = [
  { label: '급등주',   conditions: [{ field: 'change_rate', op: '>', value: '2' }] },
  { label: '고변동성', conditions: [{ field: 'volatility',  op: '>', value: '2' }] },
  { label: '거래량 급증', conditions: [{ field: 'vol_surge', op: '>=', value: '3' }] },
  { label: '고베타(시장 민감)', conditions: [{ field: 'btc_beta', op: '>=', value: '1.5' }] },
  { label: '52주 신고가 근접', conditions: [{ field: 'w52_pos', op: '>=', value: '60' }] },
  { label: '침체 저가권', conditions: [{ field: 'w52_pos', op: '<=', value: '30' }, { field: 'return_1m', op: '<', value: '0' }] },
]

let _uid = 0

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
        // change_rate는 소수(예: 0.0234) → 조건/표시는 퍼센트(2.34)를 쓰므로 ×100 정규화
        change_rate:  t.change_rate * 100,
        acc_trade_24h: Math.round((t.acc_trade_price_24h ?? 0) / 1e8),
        volatility:   s.volatility   ?? 0,
        return_1m:    s.return_1m    ?? 0,
        btc_beta:     s.btc_beta     ?? 0,
        vol_surge:    s.vol_surge    ?? 0,
        vol_zscore:   s.vol_zscore   ?? 0,
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

  function evaluate(conds) {
    return merged.filter(coin =>
      conds.every(cond => {
        const v = parseFloat(cond.value)
        if (isNaN(v)) return true
        const actual = coin[cond.field]
        if      (cond.op === '>') return actual >  v
        else if (cond.op === '<') return actual <  v
        else if (cond.op === '>=') return actual >= v
        else                      return actual <= v
      })
    )
  }

  function handleRun() {
    setResults(evaluate(conditions))
  }

  function handleReset() {
    setConditions([])
    setResults(null)
  }

  // 진입 즉시 '급등주' 프리셋 결과를 보여준다 (데이터 준비되면 1회)
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || !merged.length) return
    didInit.current = true
    const conds = PRESETS[0].conditions.map(c => ({ id: _uid++, ...c }))
    setConditions(conds)
    setResults(evaluate(conds))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged])

  if (tLoading || statsLoading) return <PageLoading />

  return (
    <div className="space-y-4">

      {/* 조건 설정 */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 mb-3">
          스크리닝 조건
          <InfoTooltip>
            원하는 조건을 모두 만족하는 종목만 걸러냅니다. 프리셋 버튼으로 자주 쓰는 조건을 채우거나, [+ 조건 추가]로 항목(등락률·거래대금·변동성·1개월 수익률·52주 위치)·연산자·값을 직접 지정한 뒤 [스크리닝 실행]하세요. 결과 행을 클릭하면 코인 상세로 이동합니다. 기본으로 '급등주' 프리셋 결과가 표시됩니다.
          </InfoTooltip>
        </div>

        {/* 프리셋 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="px-3 py-1 text-xs border border-gray-200 rounded-full text-gray-500 cursor-pointer hover:border-brand-400 hover:text-brand-500 transition-colors"
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
                className="border border-gray-200 rounded px-2.5 py-1.5 text-sm cursor-pointer focus:outline-none focus:border-brand-400"
              >
                {FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <select
                value={cond.op}
                onChange={e => updateCondition(cond.id, { op: e.target.value })}
                className="border border-gray-200 rounded px-2.5 py-1.5 text-sm cursor-pointer focus:outline-none focus:border-brand-400"
              >
                {OPS.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <input
                type="number"
                value={cond.value}
                onChange={e => updateCondition(cond.id, { value: e.target.value })}
                placeholder="값"
                className="w-24 border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400"
              />
              <span className="text-xs text-gray-400 w-4">{FIELDS.find(f => f.key === cond.field)?.unit}</span>
              <button
                onClick={() => removeCondition(cond.id)}
                className="text-gray-300 hover:text-red-400 transition-colors text-xl leading-none ml-1 cursor-pointer"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => addCondition()}
            className="px-4 py-1.5 border border-gray-200 text-sm text-gray-600 rounded cursor-pointer hover:bg-gray-50 transition-colors"
          >
            + 조건 추가
          </button>
          <button
            onClick={handleRun}
            disabled={conditions.length === 0}
            className="px-6 py-1.5 bg-brand-500 text-white text-sm font-medium rounded cursor-pointer hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            스크리닝 실행
          </button>
          {(conditions.length > 0 || results !== null) && (
            <button
              onClick={handleReset}
              className="px-4 py-1.5 text-sm text-gray-400 cursor-pointer hover:text-gray-600 transition-colors"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 결과 */}
      {results !== null && (
        <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
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
                            className="h-full bg-brand-400 rounded-full"
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
        <div className="bg-white border border-gray-200 rounded-md py-16 text-center text-sm text-gray-400">
          조건을 설정하고 스크리닝을 실행하세요
        </div>
      )}
    </div>
  )
}
