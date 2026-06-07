import client from './client'

export const getCandles = (market, interval = 'days', count = 60) =>
  client.get(`/api/candles/${market}`, { params: { interval, count } }).then(r => r.data)
