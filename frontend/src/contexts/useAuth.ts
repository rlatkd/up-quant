import { createContext, useContext } from 'react'
import type { AuthUser } from '../api/auth'

export interface AuthState {
  user: AuthUser | null
  checking: boolean
  login: (u: string, p: string) => Promise<void>
  logout: () => Promise<void>
}

// Context는 Provider(Auth.tsx)와 훅이 공유 — 컴포넌트가 아닌 export는 이 파일에 모은다
// (react-refresh: 컴포넌트 파일은 컴포넌트만 export).
export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
