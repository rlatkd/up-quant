import api from './client'

// 트렌드 대시보드(업비트 코인동향 미러) — 자체 지수·기간수익·시황(자체) + 환율·뉴스(외부)
export const getIndices       = () => api.get('/api/trends/indices').then(r => r.data)
export const getAssetIndices  = () => api.get('/api/trends/asset-indices').then(r => r.data)
export const getVolumePower   = () => api.get('/api/trends/volume-power').then(r => r.data)
export const getPeriodReturns = () => api.get('/api/trends/period-returns').then(r => r.data)
export const getBrief         = () => api.get('/api/trends/brief').then(r => r.data)
export const getFx            = () => api.get('/api/trends/fx').then(r => r.data)
export const getNews          = () => api.get('/api/trends/news').then(r => r.data)
export const getFearGreed     = () => api.get('/api/trends/fear-greed').then(r => r.data)
