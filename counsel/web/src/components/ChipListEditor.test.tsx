import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ChipListEditor from './ChipListEditor'

afterEach(cleanup)

function setup(items = ['대면', '화상'], extra: Partial<Parameters<typeof ChipListEditor>[0]> = {}) {
  const ops = { onAdd: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn() }
  render(<ChipListEditor items={items} {...ops} {...extra} />)
  return ops
}

describe('배지 목록 편집', () => {
  it('항목마다 배지가 있고 끝에 추가하기가 있다', () => {
    setup()
    expect(screen.getByText('대면')).toBeTruthy()
    expect(screen.getByText('화상')).toBeTruthy()
    expect(screen.getByRole('button', { name: '추가하기' })).toBeTruthy()
  })

  it('추가하기를 누르고 입력해 Enter 를 치면 추가하고, 다음 입력을 이어 받는다', () => {
    const ops = setup()
    fireEvent.click(screen.getByRole('button', { name: '추가하기' }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: ' 전화 ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(ops.onAdd).toHaveBeenCalledWith('전화')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })

  it('빈 값이나 이미 있는 값은 추가하지 않는다', () => {
    const ops = setup()
    fireEvent.click(screen.getByRole('button', { name: '추가하기' }))
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: '대면' } })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(ops.onAdd).not.toHaveBeenCalled()
  })

  it('입력 중 칸을 벗어나면 적은 값을 추가하고 닫힌다', () => {
    const ops = setup()
    fireEvent.click(screen.getByRole('button', { name: '추가하기' }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '방문' } })
    fireEvent.blur(input)
    expect(ops.onAdd).toHaveBeenCalledWith('방문')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('Esc 는 입력을 버리고 닫는다', () => {
    const ops = setup()
    fireEvent.click(screen.getByRole('button', { name: '추가하기' }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '방문' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(ops.onAdd).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('배지를 누르면 그 자리에서 고친다', () => {
    const ops = setup()
    fireEvent.click(screen.getByText('화상'))
    const input = screen.getByRole('textbox')
    expect((input as HTMLInputElement).value).toBe('화상')
    fireEvent.change(input, { target: { value: '비대면' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(ops.onEdit).toHaveBeenCalledWith(1, '비대면')
  })

  it('배지의 x 로 뺀다. 최소 개수면 빼는 버튼이 없다', () => {
    const ops = setup(['대면', '화상'])
    fireEvent.click(screen.getAllByTestId('CancelIcon')[0])
    expect(ops.onRemove).toHaveBeenCalledWith(0)
    cleanup()
    setup(['평일'], { min: 1 })
    expect(screen.queryByTestId('CancelIcon')).toBeNull()
  })

  it('보기 전용이면 추가하기·빼기가 없다', () => {
    setup(['대면'], { readOnly: true })
    expect(screen.queryByRole('button', { name: '추가하기' })).toBeNull()
    expect(screen.queryByTestId('CancelIcon')).toBeNull()
  })
})
