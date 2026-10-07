import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConfirmDialog from './ConfirmDialog'

// vitest 에 globals 가 없어 RTL 의 자동 정리가 꺼져 있다. 테스트마다 직접 비운다.
afterEach(cleanup)

function setup(withDismiss: boolean) {
  const fns = { onConfirm: vi.fn(), onCancel: vi.fn(), onDismiss: vi.fn() }
  render(
    <ConfirmDialog
      open message="보낼까요?" confirmLabel="보내기" cancelLabel="취소"
      onConfirm={fns.onConfirm} onCancel={fns.onCancel} onDismiss={withDismiss ? fns.onDismiss : undefined}
    />,
  )
  return fns
}

describe('ConfirmDialog', () => {
  it('Esc 는 onDismiss 만 부른다 (두 버튼이 모두 실행인 창에서 취소가 실행되면 안 된다)', async () => {
    const f = setup(true)
    await userEvent.keyboard('{Escape}')
    expect(f.onDismiss).toHaveBeenCalledTimes(1)
    expect(f.onCancel).not.toHaveBeenCalled()
    expect(f.onConfirm).not.toHaveBeenCalled()
  })

  it('확인 버튼은 onConfirm 만 부른다', async () => {
    const f = setup(true)
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(f.onConfirm).toHaveBeenCalledTimes(1)
    expect(f.onCancel).not.toHaveBeenCalled()
    expect(f.onDismiss).not.toHaveBeenCalled()
  })

  it('onDismiss 를 주지 않으면 Esc 는 onCancel 로 간다', async () => {
    const f = setup(false)
    await userEvent.keyboard('{Escape}')
    expect(f.onCancel).toHaveBeenCalledTimes(1)
    expect(f.onConfirm).not.toHaveBeenCalled()
  })
})
