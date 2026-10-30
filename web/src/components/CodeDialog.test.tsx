import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@core/copy.ko.ts'
import CodeDialog from './CodeDialog'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// userEvent.setup() 이 가짜 클립보드를 붙이므로, 그 뒤에 writeText 를 바꿔 끼운다
function setup(writeText: (s: string) => Promise<void>) {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(writeText) }, configurable: true })
  return user
}

describe('CodeDialog (코드 보기 창)', () => {
  it('코드를 크게 보이고 PC 안내를 함께 둔다. [코드 복사]가 주 버튼, [닫기]는 글자 버튼이다', () => {
    render(<CodeDialog code="TEST-0001-0002" onClose={() => {}} onCopied={() => {}} />)
    expect(screen.getByText('TEST-0001-0002')).toBeTruthy()
    expect(screen.getByText(t('code.pcNote'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('code.copy') }).className).toMatch(/MuiButton-contained/)
    expect(screen.getByRole('button', { name: t('common.close') }).className).toMatch(/MuiButton-text/)
  })

  it('[코드 복사]는 클립보드에 코드를 쓰고 알림을 부른다', async () => {
    const user = setup(async () => {})
    const onCopied = vi.fn()
    render(<CodeDialog code="TEST-0001-0002" onClose={() => {}} onCopied={onCopied} />)
    await user.click(screen.getByRole('button', { name: t('code.copy') }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('TEST-0001-0002')
    expect(onCopied).toHaveBeenCalledTimes(1)
  })

  it('복사에 실패하면 코드를 선택해 두고 길게 눌러 복사하라고 안내한다', async () => {
    const user = setup(async () => { throw new Error('denied') })
    const onCopied = vi.fn()
    render(<CodeDialog code="TEST-0001-0002" onClose={() => {}} onCopied={onCopied} />)
    await user.click(screen.getByRole('button', { name: t('code.copy') }))
    expect(await screen.findByText(t('code.copyFailed'))).toBeTruthy()
    await waitFor(() => expect(window.getSelection()?.toString()).toBe('TEST-0001-0002'))
    expect(onCopied).not.toHaveBeenCalled()
  })

  it('code 가 없으면 창을 열지 않는다', () => {
    render(<CodeDialog code={null} onClose={() => {}} onCopied={() => {}} />)
    expect(screen.queryByText(t('code.title'))).toBeNull()
  })
})

describe('CodeDialog: 클립보드 API 가 없는 인앱 브라우저', () => {
  it('navigator.clipboard 가 없으면 선택 후 execCommand(copy) 로 복사하고, 되면 알림을 부른다', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const exec = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    const onCopied = vi.fn()
    render(<CodeDialog code="TEST-0001-0002" onClose={() => {}} onCopied={onCopied} />)
    await user.click(screen.getByRole('button', { name: t('code.copy') }))
    expect(exec).toHaveBeenCalledWith('copy')
    expect(onCopied).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(t('code.copyFailed'))).toBeNull()
  })
})
