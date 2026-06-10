import { useEffect, useState, type ReactNode } from 'react'
import { me as fetchMe, login as apiLogin, logout as apiLogout, type AuthUser } from '../api/auth'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checking, setChecking] = useState(true)

  // 앱 로드 시 쿠키 세션 확인(/me). 401이면 인터셉터가 refresh를 1회 시도하고, 그래도 실패하면 미인증.
  useEffect(() => {
    let cancelled = false
    fetchMe()
      .then(u => { if (!cancelled) setUser(u) })
      .catch(() => { if (!cancelled) setUser(null) })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [])

  const login = async (u: string, p: string) => {
    const out = await apiLogin(u, p)
    setUser(out)
  }
  const logout = async () => {
    try { await apiLogout() } finally { setUser(null) }
  }

  return (
    <AuthContext.Provider value={{ user, checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
