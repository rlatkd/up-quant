import api from './client'

export const getCategoryMonthly = () => api.get('/api/analysis/category/monthly').then(r => r.data)
export const getCategoryCumulative = () => api.get('/api/analysis/category/cumulative').then(r => r.data)
export const getCoinStats = () => api.get('/api/analysis/coins').then(r => r.data)
