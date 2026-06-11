import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

// 로그인 — 대학원 과제용 단일 계정(test/test). 미인증 시 모든 페이지가 이 화면으로 막힌다.
// 배경은 깔끔한 다크 그라데이션(plain). 로고는 등장 + 쉬머, 폼은 배경에 녹는 언더라인 인라인 스타일.
export default function Login() {
  const { login, logout } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(0)   // 0=초기, 1=로고, 2=폼
  const [showPw, setShowPw] = useState(false)   // 비밀번호 표시 토글

  // /login 진입 = 무조건 세션 초기화(쿠키 삭제) → '첫 로그인'처럼.
  useEffect(() => { logout() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // 연출 단계 — 큰 로고 등장(0.2s) → (크게 머물다) 폼 등장하며 로고 자리잡음(1.4s)
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 200)
    const t2 = setTimeout(() => setStage(2), 1400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })   // 로그인 후 항상 메인(코인 목록)으로
    } catch (err: any) {
      const status = err?.response?.status
      const msg = err?.response?.data?.detail
      setError(status === 429 ? (msg || '시도가 많아 잠시 잠금되었습니다.')
        : (msg || '아이디 또는 비밀번호가 올바르지 않습니다.'))
    } finally {
      setBusy(false)
    }
  }

  const inputCls = 'w-full bg-transparent border-0 border-b border-white/35 focus:border-white ' +
    'text-white text-lg placeholder-white/45 px-1 py-2.5 focus:outline-none transition-colors'

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-4
                    bg-gradient-to-br from-[#0a1830] via-[#0d1f3d] to-[#081325]">
      {/* 로고 뒤 은은한 글로우(살짝 깊이감) */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 45% 40% at center 42%, rgba(23,99,182,0.18) 0%, transparent 70%)' }} />

      <div className="relative w-full max-w-sm text-center">
        {/* 로고 (쉬머) — 진입 시 아주 크게 떴다가 폼이 나오며 자리잡는다(scale 2.4 → 1) */}
        <div className={`mb-9 transition-opacity duration-500 ${stage >= 1 ? 'opacity-100' : 'opacity-0'}`}>
          {stage >= 1 && (
            <div className={`inline-block relative origin-center transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${stage >= 2 ? 'scale-100' : 'scale-[2.8]'}`}>
              <img src="/logo.png" alt="UPquant" className="h-20 w-auto mx-auto" />
              <div className="login-shimmer absolute inset-0" style={{
                WebkitMaskImage: 'url(/logo.png)', maskImage: 'url(/logo.png)',
                WebkitMaskSize: 'contain', maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center', maskPosition: 'center',
              }} />
            </div>
          )}
          <p className={`mt-4 text-lg text-blue-100/80 font-medium transition-opacity duration-700 ${stage >= 2 ? 'opacity-100' : 'opacity-0'}`}>
            암호화폐 퀀트 분석 대시보드
          </p>
        </div>

        {/* 로그인 폼 — 배경에 녹는 인라인 언더라인 스타일(흰 밑줄·흰 글씨) */}
        {stage >= 2 && (
          <form onSubmit={onSubmit} className="login-rise w-72 mx-auto">
            <div className="space-y-7">
              <input id="login-username" aria-label="아이디" placeholder="아이디"
                value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username"
                className={inputCls} />
              {/* 비밀번호 — 우측 눈 아이콘으로 표시/숨김 토글 */}
              <div className="relative">
                <input id="login-password" aria-label="비밀번호" placeholder="비밀번호"
                  type={showPw ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
                  className={inputCls + ' pr-9'} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 표시'} title={showPw ? '숨기기' : '표시'}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/90 cursor-pointer p-1">
                  {showPw ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {error && <div className="mt-3 text-sm text-red-300">{error}</div>}
            <button type="submit" disabled={busy || !username || !password}
              className="mt-14 w-full border border-white/45 hover:bg-white/10 text-white text-base font-semibold rounded-md py-2.5 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed transition-colors">
              {busy ? '로그인 중…' : '로그인'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
