import { useState, useEffect } from 'react'
import { getCategoryMonthly, getCategoryCumulative, getCoinStats, getCorrelation } from '../api/analysis'

const EMPTY_RETURNS = { categories: [], rows: [] }

export function useCategoryMonthly() {
  const [data, setData] = useState(EMPTY_RETURNS)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getCategoryMonthly().then(setData).finally(() => setLoading(false))
  }, [])
  return { data, loading }
}

export function useCategoryCumulative(period = '월') {
  // loading은 (loadedKey !== period)로 파생 — effect 안 setLoading(true) 제거하여
  // cascading render(react-hooks/set-state-in-effect) 회피.
  const [state, setState] = useState({ data: EMPTY_RETURNS, loadedKey: null })
  useEffect(() => {
    let cancelled = false
    getCategoryCumulative(period).then(data => {
      if (!cancelled) setState({ data, loadedKey: period })
    })
    return () => { cancelled = true }
  }, [period])
  return { data: state.data, loading: state.loadedKey !== period }
}

export function useCoinStats() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getCoinStats().then(setData).finally(() => setLoading(false))
  }, [])
  return { data, loading }
}

export function useCorrelation(market) {
  // loading은 (loadedKey !== market)로 파생 — effect 안 setLoading(true) 제거하여
  // cascading render(react-hooks/set-state-in-effect) 회피.
  const [state, setState] = useState({ data: [], loadedKey: null })
  useEffect(() => {
    if (!market) return
    let cancelled = false
    getCorrelation(market).then(data => {
      if (!cancelled) setState({ data, loadedKey: market })
    })
    return () => { cancelled = true }
  }, [market])
  return { data: state.data, loading: state.loadedKey !== market }
}
