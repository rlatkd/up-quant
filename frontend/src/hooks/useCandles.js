import { useState, useEffect } from 'react'
import { getCandles } from '../api/candles'

export function useCandles(market, interval = 'days', count = 60) {
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!market) return
    setLoading(true)
    getCandles(market, interval, count).then(setCandles).finally(() => setLoading(false))
  }, [market, interval, count])
  return { candles, loading }
}
