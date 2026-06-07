import api from './client'

export const getMetrics = () => api.get('/api/system/metrics').then(r => r.data)
