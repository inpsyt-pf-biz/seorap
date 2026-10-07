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
  it('링크로 직접 공유한 줄은 이름·번호 줄 없이 [다른 분께]만 보인다', () => {
    render(<LineRow line={line({ forwardTo: null, status: { label: '링크로 전달함', tone: 'info', actions: ['reforward'], note: '아직 안 열어 봄' } })} onAction={() => {}} />)
    expect(screen.getByText('링크로 전달함')).toBeTruthy()
    expect(screen.queryByText(/^→/)).toBeNull()
    expect(screen.getByText('아직 안 열어 봄')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다른 분께' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 보내기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '코드 보기' })).toBeNull()
  })
  it('실시한 줄은 [결과 보기]와 [코드 보기]가 보이고 [이어서 하기]는 없다', async () => {
    const onAction = vi.fn()
    render(<LineRow line={line({ status: { label: '실시함 (10-23)', tone: 'info', actions: ['result'] } })} onAction={onAction} />)
    expect(screen.getByText('실시함 (10-23)')).toBeTruthy()
    expect(screen.getByRole('button', { name: '결과 보기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '코드 보기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '이어서 하기' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '결과 보기' }))
    expect(onAction).toHaveBeenCalledWith('result', expect.objectContaining({ voucherId: 'v1' }))
  })
  it('응시 중인 줄만 [이어서 하기]와 [코드 보기]가 보인다', () => {
    render(<LineRow line={line({ status: { label: '응시 중', tone: 'info', actions: ['continue'] } })} onAction={() => {}} />)
    expect(screen.getByRole('button', { name: '이어서 하기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '코드 보기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '결과 보기' })).toBeNull()
  })
  it('완료된 줄(결과 보는 법)에는 [코드 보기]가 없다', () => {
    render(<LineRow line={line({ status: { label: '완료', tone: 'success', actions: ['result_help'] } })} onAction={() => {}} />)
    expect(screen.getByRole('button', { name: '결과 보는 법' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '코드 보기' })).toBeNull()
  })
  it('본인이 코드를 본 줄은 [실시하기]와 [코드 보기]만 보인다', () => {
    render(<LineRow line={line({ status: { label: '코드 확인함 · 10-23', tone: 'info', actions: ['launch'] } })} onAction={() => {}} />)
    expect(screen.getByText('코드 확인함 · 10-23')).toBeTruthy()
    expect(screen.getByRole('button', { name: '실시하기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '코드 보기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '전달하기' })).toBeNull()
  })
})
