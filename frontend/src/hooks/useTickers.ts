import { useState, useEffect } from 'react'
import { getTickers, getMarketSummary, getTicker, getOrderbook, getTrades } from '../api/markets'

export function useTickers() {
  const [tickers, setTickers] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getTickers().then(setTickers).finally(() => setLoading(false))
  }, [])
  return { tickers, loading }
}

export function useMarketSummary() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getMarketSummary().then(setSummary).finally(() => setLoading(false))
  }, [])
  return { summary, loading }
}

export function useTicker(market) {
  // loading을 상태로 들지 않고 (loadedKey !== market)로 파생 — effect 안에서 setLoading(true)
  // 호출이 사라져 cascading render(react-hooks/set-state-in-effect)를 회피.
  const [state, setState] = useState({ data: null, loadedKey: null })
  useEffect(() => {
    if (!market) return
    let cancelled = false
    getTicker(market).then(data => {
      if (!cancelled) setState({ data, loadedKey: market })
    })
    return () => { cancelled = true }
  }, [market])
  return { ticker: state.data, loading: state.loadedKey !== market }
}

export function useOrderbook(market) {
  const [orderbook, setOrderbook] = useState(null)
  useEffect(() => {
    if (!market) return
    getOrderbook(market).then(setOrderbook)
  }, [market])
  return { orderbook }
}

export function useTrades(market) {
  const [trades, setTrades] = useState([])
  useEffect(() => {
    if (!market) return
    getTrades(market).then(setTrades)
  }, [market])
  return { trades }
}
