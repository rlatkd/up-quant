import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PageError from './PageError'

describe('PageError', () => {
  it('메시지 표시 + 다시 시도 클릭 시 onRetry 호출', () => {
    const onRetry = vi.fn()
    render(<PageError message="실패!" onRetry={onRetry} />)
    expect(screen.getByText('실패!')).toBeInTheDocument()
    fireEvent.click(screen.getByText('다시 시도'))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
