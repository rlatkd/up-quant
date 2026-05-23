import axios from 'axios'

const client = axios.create({
  baseURL: 'http://localhost:8000',
})

// ── 공통 로깅 인터셉터 (모든 API 호출이 이 인스턴스를 거친다) ──
client.interceptors.request.use((config) => {
  config.metadata = { start: performance.now() }
  return config
})

client.interceptors.response.use(
  (res) => {
    const ms = Math.round(performance.now() - res.config.metadata.start)
    const rid = res.headers['x-request-id'] || '-'
    const method = (res.config.method || 'get').toUpperCase()
    console.log(`%c[API] ${method} ${res.config.url} → ${res.status} (${ms}ms) rid=${rid}`, 'color:#10b981')
    return res
  },
  (err) => {
    const cfg = err.config || {}
    const ms = cfg.metadata ? Math.round(performance.now() - cfg.metadata.start) : '?'
    const status = err.response?.status ?? 'ERR'
    const rid = err.response?.headers?.['x-request-id'] || '-'
    const method = (cfg.method || 'get').toUpperCase()
    console.error(`[API] ${method} ${cfg.url} → ${status} (${ms}ms) rid=${rid}`, err.message)
    return Promise.reject(err)
  },
)

export default client
