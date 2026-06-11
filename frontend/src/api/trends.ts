import api from './client'
import type {
  TrendsIndices, AssetIndices, VolumePower, PeriodReturns,
  MarketBrief, FxResult, NewsResult, FearGreed,
} from '../types'

// 트렌드 대시보드(업비트 코인동향 미러) — 자체 지수·기간수익·시황(자체) + 환율·뉴스(외부)
export const getIndices       = (): Promise<TrendsIndices> => api.get('/api/trends/indices').then(r => r.data)
export const getAssetIndices  = (): Promise<AssetIndices>  => api.get('/api/trends/asset-indices').then(r => r.data)
export const getVolumePower   = (): Promise<VolumePower>   => api.get('/api/trends/volume-power').then(r => r.data)
export const getPeriodReturns = (): Promise<PeriodReturns> => api.get('/api/trends/period-returns').then(r => r.data)
export const getBrief         = (): Promise<MarketBrief>   => api.get('/api/trends/brief').then(r => r.data)
export const getFx            = (): Promise<FxResult>      => api.get('/api/trends/fx').then(r => r.data)
export const getNews          = (): Promise<NewsResult>    => api.get('/api/trends/news').then(r => r.data)
export const getFearGreed     = (): Promise<FearGreed>     => api.get('/api/trends/fear-greed').then(r => r.data)
