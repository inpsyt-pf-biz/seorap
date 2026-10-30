import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Choice from './Choice'

afterEach(cleanup)

// 신청서의 모든 고르기(시간대 칸·상담 방식·연락 시간)는 한 가지 선택지 모양을 쓴다 (10-30 검수: 입력 간 통일감)
describe('Choice (선택지)', () => {
  it('누름 상태를 aria-pressed 로 알리고, 고르면 체크 아이콘을 그린다', async () => {
    const onClick = vi.fn()
    const { rerender, container } = render(<Choice selected={false} onClick={onClick}>대면</Choice>)
    const b = screen.getByRole('button', { name: '대면' })
    expect(b.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('[data-part="check"]')).toBeNull()
    await userEvent.click(b)
    expect(onClick).toHaveBeenCalled()
    rerender(<Choice selected onClick={onClick}>대면</Choice>)
    expect(screen.getByRole('button', { name: '대면' }).getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[data-part="check"]')).toBeTruthy()
  })
  it('글자 없는 칸도 이름(aria-label)으로 읽힌다', () => {
    render(<Choice selected={false} onClick={() => {}} label="평일 오전 상담 가능" />)
    expect(screen.getByRole('button', { name: '평일 오전 상담 가능' })).toBeTruthy()
  })
})
