import api from './client'

export const runMaCross = (params) =>
  api.get('/api/backtest/ma-cross', { params }).then(r => r.data)

export const runRsi = (params) =>
  api.get('/api/backtest/rsi', { params }).then(r => r.data)

// 다중 전략 겹쳐 비교 (한 종목에 MA·RSI 동시)
export const runCompare = ({ market, count = 200, fee_bps = 5 }) =>
  api.get('/api/backtest/compare', { params: { market, count, fee_bps } }).then(r => r.data)

// 워크포워드 (in-sample 그리드서치 → out-of-sample)
export const runWalkForward = ({ market, count = 300, n_splits = 4, fee_bps = 5 }) =>
  api.get('/api/backtest/walk-forward', { params: { market, count, n_splits, fee_bps } }).then(r => r.data)

// 포트폴리오 백테스트 — markets/weights는 쉼표 문자열로 직렬화
export const runPortfolio = ({ markets, weights, count = 180, rebalance_days = 0, fee_bps = 5 }) =>
  api.get('/api/backtest/portfolio', {
    params: {
      markets: markets.join(','),
      ...(weights ? { weights: weights.join(',') } : {}),
      count, rebalance_days, fee_bps,
    },
  }).then(r => r.data)
