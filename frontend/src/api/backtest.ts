import api from './client'
import type {
  BacktestResult, StrategyCompareResult, WalkForwardResult,
  MonteCarloResult, TsmomResult, PortfolioBacktestResult,
} from '../types'

// axios query params로 그대로 전달되는 평면 객체.
type QueryParams = Record<string, string | number>

export const runMaCross = (params: QueryParams): Promise<BacktestResult> =>
  api.get('/api/backtest/ma-cross', { params }).then(r => r.data)

export const runRsi = (params: QueryParams): Promise<BacktestResult> =>
  api.get('/api/backtest/rsi', { params }).then(r => r.data)

// 다중 전략 겹쳐 비교 (한 종목에 MA·RSI 동시)
export const runCompare = ({ market, count = 200, fee_bps = 5 }: { market: string; count?: number; fee_bps?: number }): Promise<StrategyCompareResult> =>
  api.get('/api/backtest/compare', { params: { market, count, fee_bps } }).then(r => r.data)

// 워크포워드 (in-sample 그리드서치 → out-of-sample)
export const runWalkForward = ({ market, count = 300, n_splits = 4, fee_bps = 5 }: { market: string; count?: number; n_splits?: number; fee_bps?: number }): Promise<WalkForwardResult> =>
  api.get('/api/backtest/walk-forward', { params: { market, count, n_splits, fee_bps } }).then(r => r.data)

// 몬테카를로 시뮬레이션 — 미래 가격 경로 N개 부트스트랩
export const runMonteCarlo = ({ market, horizon = 30, n_paths = 1000, count = 180 }: { market: string; horizon?: number; n_paths?: number; count?: number }): Promise<MonteCarloResult> =>
  api.get('/api/backtest/montecarlo', { params: { market, horizon, n_paths, count } }).then(r => r.data)

// 시계열 모멘텀(추세추종) + 변동성 타게팅
export const runTsmom = ({ top = 30, lookback = 60, holding = 5, count = 200, fee_bps = 5 }: { top?: number; lookback?: number; holding?: number; count?: number; fee_bps?: number }): Promise<TsmomResult> =>
  api.get('/api/backtest/tsmom', { params: { top, lookback, holding, count, fee_bps } }).then(r => r.data)

// 포트폴리오 백테스트 — markets/weights는 쉼표 문자열로 직렬화
export const runPortfolio = ({ markets, weights, count = 180, rebalance_days = 0, fee_bps = 5 }: { markets: string[]; weights?: number[]; count?: number; rebalance_days?: number; fee_bps?: number }): Promise<PortfolioBacktestResult> =>
  api.get('/api/backtest/portfolio', {
    params: {
      markets: markets.join(','),
      ...(weights ? { weights: weights.join(',') } : {}),
      count, rebalance_days, fee_bps,
    },
  }).then(r => r.data)
