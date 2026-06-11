import api from './client'
import type {
  PortfolioResult, NetworkResult, PCAResult, ClusterResult, DendrogramResult,
  GarchResult, MomentumResult, PairsResult, RegimeResult,
} from '../types'

// 퀀트/ML 분석 — 백엔드 /api/quant/* (numpy·scipy·sklearn·statsmodels·arch·hmmlearn·networkx)
export const getPortfolio  = (markets: string[]): Promise<PortfolioResult> => api.get('/api/quant/portfolio', { params: { markets: markets.join(',') } }).then(r => r.data)
export const getNetwork    = (top = 50): Promise<NetworkResult>            => api.get('/api/quant/network', { params: { top } }).then(r => r.data)
export const getPCA        = (top = 50): Promise<PCAResult>                => api.get('/api/quant/pca', { params: { top } }).then(r => r.data)
export const getClusters   = (top = 80, k = 4): Promise<ClusterResult>     => api.get('/api/quant/clusters', { params: { top, k } }).then(r => r.data)
export const getDendrogram = (top = 40): Promise<DendrogramResult>         => api.get('/api/quant/dendrogram', { params: { top } }).then(r => r.data)
export const getGarch      = (market: string): Promise<GarchResult>        => api.get(`/api/quant/garch/${market}`).then(r => r.data)
export const getMomentum   = (top = 40, lookback = 20, holding = 5, longOnly = false): Promise<MomentumResult> => api.get('/api/quant/momentum', { params: { top, lookback, holding, long_only: longOnly } }).then(r => r.data)
export const getPairs      = (top = 50): Promise<PairsResult>              => api.get('/api/quant/pairs', { params: { top } }).then(r => r.data)
export const getRegime     = (nStates = 2): Promise<RegimeResult>          => api.get('/api/quant/regime', { params: { n_states: nStates } }).then(r => r.data)
