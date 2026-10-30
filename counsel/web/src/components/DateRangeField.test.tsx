import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DateRangeField from './DateRangeField'

afterEach(cleanup)

const open = () => fireEvent.click(screen.getByRole('button', { name: /^기간:/ }))

describe('DateRangeField', () => {
  it('첫 클릭은 시작일, 둘째 클릭은 종료일로 한 번에 정하고 닫는다', () => {
    const onChange = vi.fn()
    render(<DateRangeField value={null} today="2026-10-30" onChange={onChange} />)
    open()
    // 오늘이 있는 달이 오른쪽에 오도록 9월·10월을 보여 준다
    expect(screen.getByText('2026년 9월')).toBeTruthy()
    expect(screen.getByText('2026년 10월')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '2026-10-20' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('종료일을 누르세요')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '2026-09-28' }))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-09-28', to: '2026-10-20' })
  })

  it('자주 쓰는 기간은 한 번에, 지우기는 전체 기간으로', () => {
    const onChange = vi.fn()
    const { rerender } = render(<DateRangeField value={null} today="2026-10-30" onChange={onChange} />)
    open()
    fireEvent.click(screen.getByRole('button', { name: '최근 7일' }))
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-24', to: '2026-10-30' })
    rerender(<DateRangeField value={{ from: '2026-10-24', to: '2026-10-30' }} today="2026-10-30" onChange={onChange} />)
    expect(screen.getByRole('button', { name: '기간: 2026-10-24 ~ 2026-10-30' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '기간 지우기' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
