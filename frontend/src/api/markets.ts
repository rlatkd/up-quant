import client from './client'

export const getTickers = () =>
  client.get('/api/markets/tickers').then(r => r.data)

export const getTicker = (market) =>
  client.get(`/api/markets/tickers/${market}`).then(r => r.data)

export const getMarketSummary = () =>
  client.get('/api/markets/summary').then(r => r.data)

export const getOrderbook = (market) =>
  client.get(`/api/markets/orderbook/${market}`).then(r => r.data)

export const getTrades = (market) =>
  client.get(`/api/markets/trades/${market}`).then(r => r.data)
