import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// 페이지 바탕(body) 색은 경로로 정한다. 화면 안쪽 판만 칠하면 불러오는 동안·화면 전환 순간·당겨 내릴 때 바탕색이 비친다
const TEAL = 'rgb(30, 85, 82)'
const PAPER = 'rgb(246, 242, 234)'

beforeEach(() => {
  // 입장 화면은 열리자마자 서버를 부른다. 응답 없이 기다리게 해 "불러오는 중" 상태를 본다
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  document.head.innerHTML = '<meta name="theme-color" content="#000000">'
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-surface')
})

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
const TOKEN = 'A'.repeat(32)

describe('페이지 바탕색 (닫힌 서랍은 청록, 서랍 안은 종이)', () => {
  it.each([
    ['입장 화면(불러오는 중)', `/${TOKEN}`, TEAL],
    ['비밀번호 설정', '/pin', TEAL],
    ['내 서랍', '/box', PAPER],
    ['전달 이력', '/box/history', PAPER],
    ['받는 분 화면', `/f/${TOKEN}`, PAPER],
    ['도움말', '/help', PAPER],
    ['첫 화면', '/', PAPER],
  ])('%s', (_name, path, color) => {
    at(path)
    expect(document.documentElement.getAttribute('data-surface')).toBe(color === TEAL ? 'closed' : 'open')
  })

  it('휴대폰 상단 막대 색(theme-color)도 같이 바뀐다', () => {
    at('/pin')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#1E5552')
    cleanup()
    at('/box')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#F6F2EA')
  })
})

describe('넓은 화면에서 서랍 컬럼은 바깥과 구분되는 한 장의 판이다 (10-29 검수)', () => {
  it('모든 화면은 컬럼 판(data-frame) 안에 그려지고, 판의 폭은 주 컬럼 폭이다', () => {
    at('/help')
    const frame = document.querySelector('[data-frame]') as HTMLElement
    expect(frame).toBeTruthy()
    expect(frame.getAttribute('data-frame')).toBe('open')
  })
  it('입장 화면에서는 판도 청록이다', () => {
    at(`/${TOKEN}`)
    expect(document.querySelector('[data-frame]')?.getAttribute('data-frame')).toBe('closed')
  })
})
