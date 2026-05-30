import { useState, useEffect } from 'react'
import { getCandles } from '../api/candles'

export function useCandles(market, interval = 'days', count = 60) {
  // loading은 (loadedKey !== currentKey)로 파생 — effect 안 setLoading(true) 제거하여
  // cascading render(react-hooks/set-state-in-effect) 회피.
  const currentKey = `${market}|${interval}|${count}`
  const [state, setState] = useState({ data: [], loadedKey: null })
  useEffect(() => {
    if (!market) return
    let cancelled = false
    getCandles(market, interval, count).then(data => {
      if (!cancelled) setState({ data, loadedKey: `${market}|${interval}|${count}` })
    })
    return () => { cancelled = true }
  }, [market, interval, count])
  return { candles: state.data, loading: state.loadedKey !== currentKey }
}
