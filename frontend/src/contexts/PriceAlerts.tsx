import { useState, useEffect, useRef, useCallback } from 'react'
import { PriceAlertContext, usePriceAlerts } from './usePriceAlerts'
import { useLivePrice } from './useRealtime'
import { useTickers } from '../hooks/useTickers'

// 가격 조건 알림 — 사용자가 "BTC 이상/이하 X원" 규칙을 등록하면, 실시간 시세(WS)를 감시하다
// 조건 충족 시 토스트를 띄운다. 규칙은 localStorage에 영속. 일회성(충족 후 제거).
const STORAGE_KEY = 'upquant_price_alerts'

function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}

// 한 규칙을 실시간 가격으로 감시(렌더 없음). 조건 충족 시 1회만 onTrigger.
function AlertWatch({ alert, onTrigger }) {
  const live = useLivePrice(alert.market)
  const price = live?.trade_price
  const firedRef = useRef(false)
  useEffect(() => {
    if (price == null || firedRef.current) return
    const hit = alert.op === 'above' ? price >= alert.price : price <= alert.price
    if (hit) { firedRef.current = true; onTrigger(alert, price) }
  }, [price, alert, onTrigger])
  return null
}

function ToastContainer({ toasts, dismiss }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className="bg-white dark:bg-[#1a2234] border border-brand-200 shadow-lg rounded-md px-4 py-3 w-80 flex items-start gap-3">
          <span className="text-lg leading-none mt-0.5">🔔</span>
          <div className="flex-1 text-sm">
            <div className="font-semibold text-gray-800 dark:text-gray-100">{t.title}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.body}</div>
          </div>
          <button onClick={() => dismiss(t.id)}
            className="text-gray-300 hover:text-gray-500 cursor-pointer text-lg leading-none">×</button>
        </div>
      ))}
    </div>
  )
}

export function PriceAlertProvider({ children }) {
  const [alerts, setAlerts] = useState(loadAlerts)
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts)) } catch { /* 용량 초과 등 무시 */ }
  }, [alerts])

  const addAlert = useCallback((a) => {
    setAlerts(prev => [...prev, { ...a, id: Date.now() + Math.random() }])
  }, [])
  const removeAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(x => x.id !== id))
  }, [])
  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), [])

  const handleTrigger = useCallback((alert, price) => {
    const id = Date.now() + Math.random()
    const name = alert.korean_name || alert.market.replace('KRW-', '')
    setToasts(prev => [...prev, {
      id,
      title: `${name} 가격 도달`,
      body: `${alert.op === 'above' ? '▲ 이상' : '▼ 이하'} ${alert.price.toLocaleString()} KRW · 현재 ${price.toLocaleString()}`,
    }])
    setAlerts(prev => prev.filter(x => x.id !== alert.id))  // 일회성 — 충족 후 제거
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 9000)
  }, [])

  return (
    <PriceAlertContext.Provider value={{ alerts, addAlert, removeAlert }}>
      {children}
      {alerts.map(a => <AlertWatch key={a.id} alert={a} onTrigger={handleTrigger} />)}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </PriceAlertContext.Provider>
  )
}

// 헤더 우측 🔔 버튼 + 드롭다운(규칙 추가 폼 + 목록). 호버 아닌 클릭 토글.
export function PriceAlertMenu() {
  const { alerts, addAlert, removeAlert } = usePriceAlerts()
  const { tickers } = useTickers()
  const [open, setOpen] = useState(false)
  const [market, setMarket] = useState('KRW-BTC')
  const [op, setOp] = useState('above')
  const [price, setPrice] = useState('')

  const nmap = Object.fromEntries(tickers.map(t => [t.market, t.korean_name]))

  function submit(e) {
    e.preventDefault()
    const p = Number(price)
    if (!market || !p || p <= 0) return
    addAlert({ market, korean_name: nmap[market] || market.replace('KRW-', ''), op, price: p })
    setPrice('')
  }

  return (
    <div className="relative flex items-center">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="relative flex items-center px-2 text-white/60 hover:text-white/85 transition-colors cursor-pointer"
        title="가격 알림">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {alerts.length > 0 && (
          <span className="absolute -top-1 right-0 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {alerts.length}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* 바깥 클릭 닫기 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border border-gray-100 dark:border-[#232d40] bg-white dark:bg-[#1a2234] p-3 shadow-xl text-gray-800 dark:text-gray-100">
            <div className="text-sm font-semibold mb-2">가격 알림</div>
            <form onSubmit={submit} className="flex flex-col gap-2 mb-3">
              <select value={market} onChange={e => setMarket(e.target.value)}
                className="border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1.5 text-xs cursor-pointer focus:outline-none focus:border-brand-400">
                {tickers.slice(0, 80).map(t => (
                  <option key={t.market} value={t.market}>{t.market.replace('KRW-', '')} · {t.korean_name}</option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <select value={op} onChange={e => setOp(e.target.value)}
                  className="border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1.5 text-xs cursor-pointer focus:outline-none focus:border-brand-400">
                  <option value="above">이상 ▲</option>
                  <option value="below">이하 ▼</option>
                </select>
                <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                  placeholder="목표가 (KRW)" min={0}
                  className="flex-1 border border-gray-200 dark:border-[#2c3850] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-brand-400" />
                <button type="submit"
                  className="px-3 py-1.5 rounded bg-brand-500 text-white text-xs font-medium cursor-pointer hover:bg-brand-600 transition-colors">추가</button>
              </div>
            </form>

            {alerts.length === 0 ? (
              <div className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">등록된 알림이 없습니다</div>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {alerts.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-xs py-1 px-1.5 rounded hover:bg-gray-50">
                    <span className={`font-medium ${a.op === 'above' ? 'text-red-500' : 'text-blue-500'}`}>
                      {a.op === 'above' ? '▲' : '▼'}
                    </span>
                    <span className="flex-1 text-gray-700 dark:text-gray-200">
                      {a.market.replace('KRW-', '')} <span className="text-gray-400 dark:text-gray-500">{a.korean_name}</span>
                    </span>
                    <span className="tabular-nums text-gray-600 dark:text-gray-300">{a.price.toLocaleString()}</span>
                    <button onClick={() => removeAlert(a.id)}
                      className="text-gray-300 hover:text-red-500 cursor-pointer text-base leading-none">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">실시간 시세가 조건에 도달하면 알림이 뜨고 규칙은 자동 해제됩니다.</div>
          </div>
        </>
      )}
    </div>
  )
}
