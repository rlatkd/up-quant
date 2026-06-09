import { useState, useEffect, useCallback } from 'react'
import { getCandles } from '../api/candles'

export function useCandles(market, interval = 'days', count = 60) {
  // loading/error는 (loadedKey, nonce)로 파생 — effect 안 setState(true)를 피해
  // cascading render(react-hooks/set-state-in-effect)를 회피.
  const [nonce, setNonce] = useState(0)
  const key = `${market}|${interval}|${count}:${nonce}`
  const [state, setState] = useState({ data: [], error: false, loadedKey: null })
  useEffect(() => {
    if (!market) return
    let cancelled = false
    getCandles(market, interval, count)
      .then(data => { if (!cancelled) setState({ data, error: false, loadedKey: `${market}|${interval}|${count}:${nonce}` }) })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, error: true, loadedKey: `${market}|${interval}|${count}:${nonce}` })) })
    return () => { cancelled = true }
  }, [market, interval, count, nonce])
  const retry = useCallback(() => setNonce(n => n + 1), [])
  return { candles: state.data, loading: state.loadedKey !== key, error: state.error, retry }
}
