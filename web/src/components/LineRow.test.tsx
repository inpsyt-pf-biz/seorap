import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoxLine } from '@core/apiTypes.ts'
import LineRow from './LineRow'

const line = (o: Partial<BoxLine> = {}): BoxLine => ({
  voucherId: 'v1', testItemId: 'T', testName: 'STS 성인 기질검사', unitNo: 1, unitsOfTest: 2, firstLaunchedAt: null, forwardTo: null,
  status: { label: '실시 전', tone: 'neutral', actions: ['launch', 'forward'] }, ...o,
})

// vitest 에 globals 가 없어 RTL 의 자동 정리가 꺼져 있다. 테스트마다 직접 비운다.
afterEach(cleanup)

describe('LineRow', () => {
  it('검사명·순번·상태와 상태가 허용한 버튼만 보인다', () => {
    render(<LineRow line={line()} onAction={() => {}} />)
    expect(screen.getByText('STS 성인 기질검사')).toBeTruthy()
    expect(screen.getByText('2매 중 1번째')).toBeTruthy()
    expect(screen.getByText('실시 전')).toBeTruthy()
    expect(screen.getByRole('button', { name: '실시하기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '전달하기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 보내기' })).toBeNull()
  })
  it('1매뿐이면 순번을 보이지 않는다', () => {
    render(<LineRow line={line({ unitsOfTest: 1 })} onAction={() => {}} />)
    expect(screen.queryByText('1매 중 1번째')).toBeNull()
  })
  it('버튼을 누르면 해당 동작으로 부른다', async () => {
    const onAction = vi.fn()
    render(<LineRow line={line()} onAction={onAction} />)
    await userEvent.click(screen.getByRole('button', { name: '전달하기' }))
    expect(onAction).toHaveBeenCalledWith('forward', expect.objectContaining({ voucherId: 'v1' }))
  })
  it('전달한 줄은 받는 분 이름·번호를 보여 준다', () => {
    render(<LineRow line={line({ forwardTo: { name: '김영희', phone: '010-2222-3333' }, status: { label: '전달함 · 김영희', tone: 'info', actions: ['resend'], note: '받는 분이 열어 봄' } })} onAction={() => {}} />)
    expect(screen.getByText('→ 김영희 · 010-2222-3333')).toBeTruthy()
    expect(screen.getByText('받는 분이 열어 봄')).toBeTruthy()
  })
})
