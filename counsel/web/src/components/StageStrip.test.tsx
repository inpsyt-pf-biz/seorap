import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { StageCounts } from '@counsel-core/purchases.ts'
import StageStrip from './StageStrip'

afterEach(cleanup)

const counts = (testOnly = 0): StageCounts => ({
  all: 9, todo: 4, testOnly, unassigned: 2,
  stage: { application: 2, booking: 3, confirmed: 1, completed: 1 },
  exit: {
    application: { unable: 0, cancelled: 0 }, booking: { unable: 1, cancelled: 1 },
    confirmed: { unable: 0, cancelled: 0 }, completed: { unable: 0, cancelled: 0 },
  },
})

describe('StageStrip', () => {
  it('단계 칸은 네 개, 미배정·불가·취소는 예약 중 아래에', () => {
    render(<StageStrip counts={counts()} value="" onChange={() => {}} />)
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(4)
    expect(screen.getByText('미배정 2')).toBeTruthy()
    expect(screen.getByText('취소 1')).toBeTruthy()
    expect(screen.getByText('불가 1')).toBeTruthy()
    expect(screen.queryByText(/검사만/)).toBeNull()
  })

  it('단계를 누르면 그 단계로, 고른 단계를 다시 누르면 전체로', () => {
    const onChange = vi.fn()
    const { rerender } = render(<StageStrip counts={counts()} value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /예약 중/ }))
    expect(onChange).toHaveBeenLastCalledWith('booking')
    rerender(<StageStrip counts={counts()} value="booking" onChange={onChange} />)
    expect(screen.getByRole('button', { name: /예약 중/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /예약 중/ }))
    expect(onChange).toHaveBeenLastCalledWith('')
    fireEvent.click(screen.getByText('불가 1'))
    expect(onChange).toHaveBeenLastCalledWith('booking:unable')
    fireEvent.click(screen.getByText('미배정 2'))
    expect(onChange).toHaveBeenLastCalledWith('booking:unassigned')
    fireEvent.click(screen.getByText('할 일 4'))
    expect(onChange).toHaveBeenLastCalledWith('__todo__')
  })

  it('검사만 산 주문이 있으면 따로 센다', () => {
    const onChange = vi.fn()
    render(<StageStrip counts={counts(3)} value="" onChange={onChange} />)
    fireEvent.click(screen.getByText('검사만 3'))
    expect(onChange).toHaveBeenLastCalledWith('__test_only__')
  })
})
