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
  const [ticker, setTicker] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!market) return
    setLoading(true)
    getTicker(market).then(setTicker).finally(() => setLoading(false))
  }, [market])
  return { ticker, loading }
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
