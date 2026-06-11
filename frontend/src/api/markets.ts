import client from './client'
import type { Ticker, MarketSummary, Orderbook, Trade } from '../types'

export const getTickers = (): Promise<Ticker[]> =>
  client.get('/api/markets/tickers').then(r => r.data)

export const getTicker = (market: string): Promise<Ticker> =>
  client.get(`/api/markets/tickers/${market}`).then(r => r.data)

export const getMarketSummary = (): Promise<MarketSummary> =>
  client.get('/api/markets/summary').then(r => r.data)

export const getOrderbook = (market: string): Promise<Orderbook> =>
  client.get(`/api/markets/orderbook/${market}`).then(r => r.data)

export const getTrades = (market: string): Promise<Trade[]> =>
  client.get(`/api/markets/trades/${market}`).then(r => r.data)
