import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { tokens } from '../theme/seorap'
import Wordmark from './Wordmark'

afterEach(cleanup)

describe('Wordmark (로고 C1 + 리디바탕 워드마크)', () => {
  it('로고와 워드마크는 그림 파일이 아니라 글자로 읽히는 벡터 하나다 (이름: 인싸이트 서랍)', () => {
    const { container } = render(<Wordmark />)
    expect(screen.getByRole('img', { name: '인싸이트 서랍' })).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('로고 옆 글자는 "서랍" 하나뿐이다 ("인싸이트" 병기 없음, 10-30 검수)', () => {
    const { container } = render(<Wordmark />)
    expect(container.querySelector('[data-part="wordmark-parent"]')).toBeNull()
    expect(container.querySelector('[data-part="wordmark-name"]')).toBeTruthy()
    expect(screen.queryByText('인싸이트')).toBeNull()
  })

  it('종이 바탕에서는 로고 몸체가 청록, 손잡이가 호박빛이다', () => {
    const { container } = render(<Wordmark />)
    expect(container.querySelector('[data-part="logo-body"]')?.getAttribute('fill')).toBe(tokens.teal[700])
    expect(container.querySelector('[data-part="logo-handle"]')?.getAttribute('stroke')).toBe(tokens.amber[500])
  })

  it('청록 머리 판 위에서는 로고 몸체를 한 단계 밝혀 바탕에 묻히지 않게 한다', () => {
    const { container } = render(<Wordmark onTeal />)
    expect(container.querySelector('[data-part="logo-body"]')?.getAttribute('fill')).toBe(tokens.teal[500])
  })
})
