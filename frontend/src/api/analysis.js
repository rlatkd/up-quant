import api from './client'

export const getCategoryMonthly    = () => api.get('/api/analysis/category/monthly').then(r => r.data)
export const getCategoryDailyCumulative = () => api.get('/api/analysis/category/cumulative-daily').then(r => r.data)
export const getCoinStats          = () => api.get('/api/analysis/coins').then(r => r.data)
export const getCorrelation        = (market) => api.get(`/api/analysis/correlation/${market}`).then(r => r.data)
