import axios from 'axios'
import { API_BASE } from '../config'

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,   // HttpOnly 인증 쿠키(access/refresh)를 모든 요청에 동봉
})

// ── 공통 로깅 인터셉터 (모든 API 호출이 이 인스턴스를 거친다) ──
client.interceptors.request.use((config: any) => {
  config.metadata = { start: performance.now() }
  return config
})

// access 토큰 만료(401) 시 refresh를 1회 시도하고 원요청을 재시도한다. refresh도 실패하면 로그인으로.
// 동시 다발 401에 refresh가 폭주하지 않게 진행 중 refresh promise를 공유(single-flight).
let refreshing: Promise<unknown> | null = null

client.interceptors.response.use(
  (res) => {
    const ms = Math.round(performance.now() - (res.config as any).metadata.start)
    const rid = res.headers['x-request-id'] || '-'
    const method = (res.config.method || 'get').toUpperCase()
    console.log(`%c[API] ${method} ${res.config.url} → ${res.status} (${ms}ms) rid=${rid}`, 'color:#10b981')
    return res
  },
  async (err) => {
    const cfg = err.config || {}
    const status = err.response?.status
    const url: string = cfg.url || ''
    // 인증 엔드포인트 자체의 401은 그대로 전파(로그인 실패 등). 그 외 보호 API의 401은 refresh 시도.
    if (status === 401 && !cfg._retry && !url.includes('/api/auth/')) {
      cfg._retry = true
      try {
        refreshing = refreshing || client.post('/api/auth/refresh')
        await refreshing
        refreshing = null
        return client(cfg)            // 새 access 쿠키로 원요청 재시도
      } catch {
        refreshing = null
        if (!location.pathname.startsWith('/login')) {
          location.href = '/login'    // refresh도 실패 → 세션 만료, 로그인으로
        }
      }
    }
    const ms = cfg.metadata ? Math.round(performance.now() - cfg.metadata.start) : '?'
    const rid = err.response?.headers?.['x-request-id'] || '-'
    const method = (cfg.method || 'get').toUpperCase()
    console.error(`[API] ${method} ${cfg.url} → ${status ?? 'ERR'} (${ms}ms) rid=${rid}`, err.message)
    return Promise.reject(err)
  },
)

export default client
