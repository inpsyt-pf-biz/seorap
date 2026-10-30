import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// 바탕은 모든 화면이 종이색이다 (75:20:5, 10-30). 휴대폰 상단 막대(theme-color)만 청록 머리 판이 있는 화면에서 청록으로 잇는다
const TEAL = '#1E5552'
const PAPER = '#F6F2EA'

beforeEach(() => {
  // 입장 화면은 열리자마자 서버를 부른다. 응답 없이 기다리게 해 "불러오는 중" 상태를 본다
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  document.head.innerHTML = '<meta name="theme-color" content="#000000">'
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
const TOKEN = 'A'.repeat(32)

describe('페이지 바탕은 모두 종이색 (입장 화면 포함, 75:20:5)', () => {
  const themeColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
  it.each([
    ['입장 화면(불러오는 중)', `/${TOKEN}`],
    ['비밀번호 설정', '/pin'],
    ['받는 분 화면', `/f/${TOKEN}`],
    ['도움말', '/help'],
    ['첫 화면', '/'],
  ])('%s: 상단 막대도 종이색이고, 경로별 바탕 표시(data-surface)는 없다', (_name, path) => {
    at(path)
    expect(themeColor()).toBe(PAPER)
    expect(document.documentElement.hasAttribute('data-surface')).toBe(false)
  })
  it('청록 머리 판이 있는 서랍·전달 이력 화면은 상단 막대만 청록이다 (머리 판과 이어지게)', () => {
    at('/box')
    expect(themeColor()).toBe(TEAL)
    cleanup()
    at('/box/history')
    expect(themeColor()).toBe(TEAL)
  })
})

describe('넓은 화면에서 서랍 컬럼은 바깥과 구분되는 한 장의 판이다 (10-29 검수)', () => {
  it('모든 화면은 컬럼 판(data-frame) 안에 그려진다', () => {
    at('/help')
    expect(document.querySelector('[data-frame]')).toBeTruthy()
  })
  it('입장 화면도 같은 판이다 (청록 판 없음)', () => {
    at(`/${TOKEN}`)
    expect(document.querySelector('[data-frame]')).toBeTruthy()
    expect(document.querySelector('[data-frame="closed"]')).toBeNull()
  })
})
