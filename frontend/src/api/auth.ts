import client from './client'

// 인증 API — 토큰은 백엔드가 HttpOnly 쿠키로 내려주므로 프론트는 토큰 문자열을 다루지 않는다.
export interface AuthUser { username: string }

export async function login(username: string, password: string): Promise<AuthUser> {
  // OAuth2 표준은 form-urlencoded(username/password)
  const body = new URLSearchParams({ username, password })
  const { data } = await client.post('/api/auth/login', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data
}

export async function logout(): Promise<void> {
  await client.post('/api/auth/logout')
}

export async function me(): Promise<AuthUser> {
  const { data } = await client.get('/api/auth/me')
  return data
}

// WS 연결용 단기 티켓(60초) — 쿠키 인증된 REST로 받아 ws URL ?token=에 붙인다(브라우저 WS 쿠키 미전송 우회).
export async function wsTicket(): Promise<string> {
  const { data } = await client.get('/api/auth/ws-ticket')
  return data.ticket
}
