import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from './Login'

// useAuth를 모킹 — 로그인 성공/실패 흐름만 검증(네트워크 없음).
const loginMock = vi.fn()
vi.mock('../contexts/useAuth', () => ({
  useAuth: () => ({ user: null, checking: false, login: loginMock, logout: vi.fn() } as any),
}))

function renderLogin() {
  return render(<MemoryRouter><Login /></MemoryRouter>)
}

describe('Login', () => {
  beforeEach(() => loginMock.mockReset())

  it('인트로 후 폼 등장 + 아이디/비번 입력 후 로그인 호출', async () => {
    loginMock.mockResolvedValue(undefined)
    renderLogin()
    // 폼은 인트로 애니메이션(약 1.5s) 뒤에 나타난다 → 등장 대기.
    const idInput = await screen.findByLabelText('아이디', undefined, { timeout: 3000 })
    fireEvent.change(idInput, { target: { value: 'test' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'test' } })
    expect(screen.getByRole('button', { name: '로그인' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('test', 'test'))
  })
})
