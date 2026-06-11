// 백엔드 Pydantic 스키마(backend/app/schemas/*.py)를 거울처럼 옮긴 프론트 도메인 타입.
// API 응답의 진실의 원천 — api/ → hooks/ → 컴포넌트로 이 타입을 흘려보낸다.
// (백엔드 스키마가 바뀌면 여기도 함께 갱신할 것.)

// ── 시세 (market.py) ──────────────────────────────────────────
export interface Ticker {
  market: string
  korean_name: string
  trade_price: number
  change: 'RISE' | 'FALL' | 'EVEN' | string
  change_rate: number
  change_price: number
  acc_trade_price_24h: number
  high_price: number
  low_price: number
  prev_closing_price: number
  sparkline: number[]
  is_52w_high: boolean
  is_52w_low: boolean
  w52_high: number
  w52_low: number
}

export interface MarketSummary {
  total_volume: number
  up_count: number
  down_count: number
  btc_dominance: number
}

export interface OrderbookUnit {
  price: number
  size: number
}

export interface Orderbook {
  market: string
  asks: OrderbookUnit[]
  bids: OrderbookUnit[]
}

export interface Trade {
  timestamp: number
  price: number
  volume: number
  side: 'BID' | 'ASK' | string
  _id?: number   // 프론트가 체결 목록에 부여하는 고유 키(WS 수신 시)
}

// ── 캔들 (candle.py) ──────────────────────────────────────────
export interface CandleItem {
  timestamp: number   // unix ms
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ── 분석 (analysis.py) ────────────────────────────────────────
export interface CategoryReturns {
  categories: string[]
  rows: Record<string, number | string>[]
}

export interface CoinStat {
  market: string
  korean_name: string
  category: string | null
  volatility: number
  return_1m: number
  acc_trade_price_24h: number
  btc_beta: number
  vol_zscore: number
  vol_surge: number
}

export interface CorrelationItem {
  market: string
  korean_name: string
  correlation: number
}

export interface AdvanceDeclinePoint {
  time: number
  ad_line: number
  advancers: number
  decliners: number
  index: number
}

export interface AdvanceDeclineResult {
  points: AdvanceDeclinePoint[]
  n: number
  n_obs: number
}

// ── 퀀트 (quant.py) ───────────────────────────────────────────
export interface PortfolioPoint { vol: number; ret: number; sharpe: number }
export interface PortfolioWeight { market: string; korean_name: string; weight: number }
export interface PortfolioSpot {
  vol: number; ret: number; sharpe: number
  weights: PortfolioWeight[]
  risk_contrib: number[]
  diversification: number
}
export interface AssetPoint { market: string; korean_name: string; vol: number; ret: number; sharpe: number }
export interface FrontierPoint { vol: number; ret: number; weights: number[] }
export interface PortfolioResult {
  points: PortfolioPoint[]
  frontier: FrontierPoint[]
  max_sharpe: PortfolioSpot
  min_vol: PortfolioSpot
  risk_parity: PortfolioSpot
  assets: AssetPoint[]
  n_obs: number
  shrinkage: number
  corr_labels: string[]
  corr_matrix: number[][]
}

export interface NetworkNode { market: string; korean_name: string; category: string | null; value: number; degree: number }
export interface NetworkEdge { source: string; target: string; corr: number }
export interface NetworkResult { nodes: NetworkNode[]; edges: NetworkEdge[]; n_obs: number }

export interface PCAComponent { index: number; explained: number }
export interface PCALoading { market: string; korean_name: string; category: string | null; pc1: number; pc2: number }
export interface PCAResult { components: PCAComponent[]; loadings: PCALoading[]; pc1_explained: number; n_obs: number }

export interface ClusterPoint {
  market: string; korean_name: string; category: string | null
  cluster: number; volatility: number; return_1m: number; log_value: number
}
export interface ClusterResult { points: ClusterPoint[]; k: number; n: number }

export interface DendrogramResult {
  icoord: number[][]; dcoord: number[][]
  labels: string[]; markets: string[]; categories: (string | null)[]; n_obs: number
}

export interface VolPoint { time: number; vol: number }
export interface GarchResult {
  market: string; korean_name: string
  cond_vol: VolPoint[]; forecast_vol: number[]
  current_vol_annual: number; var_95: number; hist_var_95: number; cvar_95: number
  persistence: number; n_obs: number
}

export interface MomentumEquityPoint { time: number; factor: number; benchmark: number }
export interface MomentumHolding { market: string; korean_name: string; category: string | null; momentum: number; leg: 'LONG' | 'SHORT' | string }
export interface MomentumResult {
  equity: MomentumEquityPoint[]
  total_return: number; benchmark_return: number; sharpe: number; mdd: number
  long: MomentumHolding[]; short: MomentumHolding[]
  lookback: number; holding: number; n: number; fee_bps: number; long_only: boolean
}

export interface CointPair {
  market1: string; korean_name1: string; market2: string; korean_name2: string
  pvalue: number; correlation: number; hedge_ratio: number; zscore: number
  signal: 'LONG_SPREAD' | 'SHORT_SPREAD' | 'NEUTRAL' | string
  fdr_pass: boolean; bt_return: number; bt_trades: number; bt_winrate: number
}
export interface PairBacktestPoint { time: number; z: number; equity: number }
export interface PairBacktestDetail {
  market1: string; korean_name1: string; market2: string; korean_name2: string
  entry: number; exit: number; formation_end: number; points: PairBacktestPoint[]
}
export interface PairsResult {
  pairs: CointPair[]; tested: number; found: number; found_fdr: number
  fdr_alpha: number; n_obs: number; best: PairBacktestDetail | null
}

export interface RegimePoint { time: number; regime: number; index: number }
export interface RegimeStat { regime: number; label: string; mean_return: number; volatility: number; days: number; share: number }
export interface RegimeResult { points: RegimePoint[]; stats: RegimeStat[]; current_regime: number; current_label: string; n_states: number; n_obs: number }

// ── 백테스트 (backtest.py) ────────────────────────────────────
export interface EquityPoint { time: number; value: number; benchmark: number; benchmark_btc: number }
export interface TradeRecord { time: number; side: 'BUY' | 'SELL' | string; price: number; pnl: number }
export interface BacktestMetrics {
  total_return: number; benchmark_return: number; benchmark_btc_return: number
  mdd: number; win_rate: number; trade_count: number
  fee_bps: number; slippage_bps: number
  sharpe: number; sortino: number; calmar: number
  target_vol: number; avg_position: number
}
export interface BacktestResult { equity: EquityPoint[]; trades: TradeRecord[]; metrics: BacktestMetrics }

export interface PortfolioBacktestPoint { time: number; value: number; benchmark: number }
export interface AssetContribution { market: string; korean_name: string; weight: number; asset_return: number }
export interface PortfolioBacktestResult {
  equity: PortfolioBacktestPoint[]
  total_return: number; benchmark_return: number; mdd: number; sharpe: number; volatility: number
  contributions: AssetContribution[]; rebalance_days: number; n_obs: number
}

export interface StrategyCurve { name: string; equity: number[]; total_return: number }
export interface StrategyCompareResult { times: number[]; strategies: StrategyCurve[]; benchmark: number[]; benchmark_btc: number[] }

export interface WalkForwardFold { fast: number; slow: number; oos_return: number; train_end: number; test_end: number }
export interface WalkForwardResult { folds: WalkForwardFold[]; equity: EquityPoint[]; total_return: number; n_splits: number; overfit_pvalue: number; n_trials: number }

export interface MonteCarloPoint { day: number; p5: number; p25: number; p50: number; p75: number; p95: number }
export interface MonteCarloResult {
  market: string; korean_name: string; bands: MonteCarloPoint[]
  horizon: number; n_paths: number
  final_p5: number; final_p50: number; final_p95: number
  expected_return: number; prob_loss: number; daily_mean: number; daily_vol: number; n_obs: number
}

export interface TsmomEquityPoint { time: number; value: number; benchmark: number }
export interface TsmomHolding { market: string; korean_name: string; momentum: number; weight: number }
export interface TsmomResult {
  equity: TsmomEquityPoint[]
  total_return: number; benchmark_return: number; sharpe: number; mdd: number
  avg_exposure: number; holdings: TsmomHolding[]
  lookback: number; holding: number; n: number; fee_bps: number
}

// ── 트렌드/대시보드 (trends.py) ───────────────────────────────
export interface IntradayPoint { h: number; pct: number }
export interface MarketIndex {
  key: string; label: string; value: number; change_rate: number
  spark: number[]; today: IntradayPoint[]; prev: IntradayPoint[]; n: number
}
export interface TrendsIndices { indices: MarketIndex[] }

export interface VolumePowerItem { market: string; korean_name: string; power: number }
export interface VolumePower { buy: VolumePowerItem[]; sell: VolumePowerItem[]; error: string | null }

export interface AssetIndexRow {
  key: string; label: string; desc: string; tab: string; value: number
  d1: number | null; m1: number | null; m3: number | null; n: number
}
export interface AssetIndices { rows: AssetIndexRow[] }

export interface PeriodReturnRow {
  market: string; korean_name: string; acc_trade_price_24h: number
  r1w: number | null; r1m: number | null; r3m: number | null; r6m: number | null; r1y: number | null
  market_cap: number | null; market_cap_rank: number | null
}
export interface PeriodReturns { rows: PeriodReturnRow[] }

export interface FxRate { pair: string; label: string; unit: number; price: number; change: number; change_rate: number; spark: number[] }
export interface FxResult { rates: FxRate[]; as_of: string; spark_dates: string[]; error: string | null }

export interface NewsItem { title: string; url: string; source: string; published: string; ts: number }
export interface NewsResult { items: NewsItem[]; error: string | null }

export interface MarketBrief {
  text: string; as_of: string; rise: number; fall: number; avg_change: number
  dominance: number; dominance_label: string; total_volume: number
}

export interface FearGreed {
  value: number; label: string; classification: string; as_of: string
  source: string; error: string | null
}

// ── 시그널 (signal.py) ────────────────────────────────────────
export interface SignalItem {
  kind: 'momentum' | 'pair' | 'regime' | 'breakout' | string
  market: string; korean_name: string; title: string; detail: string; value: number; action: string
}
export interface SignalsResult { as_of: string; regime_label: string; regime_changed: boolean; items: SignalItem[]; n: number }

// ── AI 리포트 (report.py) ─────────────────────────────────────
export interface ReportResult {
  report_type: string; title: string; markdown: string; model: string
  generated_at: number; enabled: boolean; note: string | null
}
