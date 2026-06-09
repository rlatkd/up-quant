import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTickers, getMarketSummary, getTicker, getOrderbook, getTrades } from '../api/markets'
import { useFetch } from './useFetch'

export function useTickers() {
  // 호출부가 기대하는 키(tickers)를 유지하면서 error/retry를 함께 노출. 동일 키 디둡으로 여러 페이지가 1회 fetch 공유.
  const { data, loading, error, retry } = useFetch(['markets', 'tickers'], getTickers, [])
  return { tickers: data, loading, error, retry }
}

export function useMarketSummary() {
  const { data, loading, error, retry } = useFetch(['markets', 'summary'], getMarketSummary, null)
  return { summary: data, loading, error, retry }
}

export function useTicker(market) {
  const q = useQuery({
    queryKey: ['markets', 'ticker', market],
    queryFn: () => getTicker(market),
    enabled: !!market,
    placeholderData: null,
  })
  return { ticker: q.data ?? null, loading: q.isLoading, error: q.isError, retry: () => { q.refetch() } }
}

// 호가·체결은 코인 상세에서 WS(useMarketStream)가 실시간으로 덧씌우는 REST 폴백이라 dedup 이득이 작아
// 단순 effect 유지(WS 도착 전 초기 1회 스냅샷용).
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
