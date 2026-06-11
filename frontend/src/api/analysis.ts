import api from './client'
import type { CategoryReturns, CoinStat, CorrelationItem, AdvanceDeclineResult } from '../types'

export const getCategoryMonthly         = (): Promise<CategoryReturns> => api.get('/api/analysis/category/monthly').then(r => r.data)
export const getCategoryDailyCumulative = (): Promise<CategoryReturns> => api.get('/api/analysis/category/cumulative-daily').then(r => r.data)
export const getCoinStats               = (): Promise<CoinStat[]> => api.get('/api/analysis/coins').then(r => r.data)
export const getCorrelation             = (market: string): Promise<CorrelationItem[]> => api.get(`/api/analysis/correlation/${market}`).then(r => r.data)
export const getAdvanceDecline          = (): Promise<AdvanceDeclineResult> => api.get('/api/analysis/advance-decline').then(r => r.data)
