import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tokens } from '../theme/seorap'
import BoxHeader from './BoxHeader'

afterEach(cleanup)

// 서랍 안 화면의 머리 판: 닫힌 서랍의 앞판(청록)이 위에 남고 그 아래로 서랍이 열린다 (10-29 검수: 요소가 시각적으로 묶이지 않음)
describe('BoxHeader (머리 판)', () => {
  const draw = (onTab = vi.fn()) => render(<BoxHeader ownerName="김서랍" summary="실시 전 3매" tab={0} onTab={onTab} onLogout={() => {}} />)

  it('워드마크·로그아웃·제목·요약·탭이 청록 판 하나에 묶인다', () => {
    draw()
    const shell = document.querySelector('[data-region="shell"]') as HTMLElement
    expect(shell).toBeTruthy()
    const s = within(shell)
    expect(s.getByRole('button', { name: '로그아웃' })).toBeTruthy()
    expect(s.getByText('김서랍님의 서랍')).toBeTruthy()
    expect(s.getByText('실시 전 3매')).toBeTruthy()
    expect(s.getByRole('tablist')).toBeTruthy()
    expect(shell.querySelector('[data-part="logo-body"]')?.getAttribute('fill')).toBe(tokens.teal[500])
  })

  it('선택된 탭 표시는 로고 손잡이와 같은 호박빛이다', () => {
    draw()
    const indicator = document.querySelector('.MuiTabs-indicator') as HTMLElement
    expect(indicator.style.backgroundColor).toBe('rgb(242, 178, 76)')
  })

  it('탭을 누르면 그 번호로 알린다', async () => {
    const onTab = vi.fn()
    draw(onTab)
    await userEvent.click(screen.getByRole('tab', { name: '전달 이력' }))
    expect(onTab).toHaveBeenCalledWith(1)
  })

  it('요약이 없으면 요약 줄을 그리지 않는다', () => {
    render(<BoxHeader ownerName="김서랍" summary={null} tab={1} onTab={() => {}} onLogout={() => {}} />)
    expect(screen.queryByText(/실시 전/)).toBeNull()
  })
})
