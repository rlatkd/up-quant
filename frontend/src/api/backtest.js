import api from './client'

export const runMaCross = (params) =>
  api.get('/api/backtest/ma-cross', { params }).then(r => r.data)

export const runRsi = (params) =>
  api.get('/api/backtest/rsi', { params }).then(r => r.data)
