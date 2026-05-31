import api from './client'

export const runMaCross = (params) =>
  api.get('/api/backtest/ma-cross', { params }).then(r => r.data)

export const runRsi = (params) =>
  api.get('/api/backtest/rsi', { params }).then(r => r.data)

// 포트폴리오 백테스트 — markets/weights는 쉼표 문자열로 직렬화
export const runPortfolio = ({ markets, weights, count = 180, rebalance_days = 0 }) =>
  api.get('/api/backtest/portfolio', {
    params: {
      markets: markets.join(','),
      ...(weights ? { weights: weights.join(',') } : {}),
      count, rebalance_days,
    },
  }).then(r => r.data)
