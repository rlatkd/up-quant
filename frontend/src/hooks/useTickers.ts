import { useState, useEffect, useCallback } from 'react'
import { getTickers, getMarketSummary, getTicker, getOrderbook, getTrades } from '../api/markets'
import { useFetch } from './useFetch'

export function useTickers() {
  // 호출부가 기대하는 키(tickers)를 유지하면서 error/retry를 함께 노출.
  const { data, loading, error, retry } = useFetch(getTickers, [])
  return { tickers: data, loading, error, retry }
}

export function useMarketSummary() {
  const { data, loading, error, retry } = useFetch(getMarketSummary, null)
  return { summary: data, loading, error, retry }
}

export function useTicker(market) {
  // loading/error는 (loadedKey, nonce)로 파생 — effect 안 setState(true)를 피해
  // cascading render(react-hooks/set-state-in-effect)를 회피.
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState({ data: null, error: false, loadedKey: null })
  useEffect(() => {
    if (!market) return
    let cancelled = false
    getTicker(market)
      .then(data => { if (!cancelled) setState({ data, error: false, loadedKey: `${market}:${nonce}` }) })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, error: true, loadedKey: `${market}:${nonce}` })) })
    return () => { cancelled = true }
  }, [market, nonce])
  const retry = useCallback(() => setNonce(n => n + 1), [])
  return { ticker: state.data, loading: state.loadedKey !== `${market}:${nonce}`, error: state.error, retry }
}

export function useOrderbook(market) {
  const [orderbook, setOrderbook] = useState(null)
  useEffect(() => {
    if (!market) return
    let cancelled = false
    getOrderbook(market).then(d => { if (!cancelled) setOrderbook(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [market])
  return { orderbook }
}

export function useTrades(market) {
  const [trades, setTrades] = useState([])
  useEffect(() => {
    if (!market) return
    let cancelled = false
    getTrades(market).then(d => { if (!cancelled) setTrades(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [market])
  return { trades }
}
