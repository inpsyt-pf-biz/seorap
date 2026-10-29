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

  it('"인싸이트" 표시를 함께 보여 진짜 서비스임을 알린다', () => {
    render(<Wordmark />)
    expect(screen.getByText('인싸이트')).toBeTruthy()
  })

  it('종이 바탕에서는 로고 몸체가 청록, 손잡이가 호박빛이다', () => {
    const { container } = render(<Wordmark />)
    expect(container.querySelector('[data-part="logo-body"]')?.getAttribute('fill')).toBe(tokens.teal[700])
    expect(container.querySelector('[data-part="logo-handle"]')?.getAttribute('stroke')).toBe(tokens.amber[500])
  })

  it('닫힌 서랍(청록 바탕)에서는 로고 몸체를 한 단계 밝혀 바탕에 묻히지 않게 한다', () => {
    const { container } = render(<Wordmark onTeal />)
    expect(container.querySelector('[data-part="logo-body"]')?.getAttribute('fill')).toBe(tokens.teal[500])
  })
})
