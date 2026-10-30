import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HelpPage from './HelpPage'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('HelpPage', () => {
  it('[메인으로]로 왔던 화면(서랍)으로 돌아간다 (10-30 검수: 도움말에서 돌아갈 길이 없음)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [], contact: '문의' }), { status: 200 })))
    render(
      <MemoryRouter initialEntries={['/box', '/help']} initialIndex={1}>
        <Routes>
          <Route path="/box" element={<div>서랍 화면</div>} />
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: '메인으로' }))
    expect(await screen.findByText('서랍 화면')).toBeTruthy()
  })
  it('바로 열었으면(이전 화면 없음) [메인으로]는 서랍으로 간다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [], contact: '문의' }), { status: 200 })))
    render(
      <MemoryRouter initialEntries={['/help']}>
        <Routes>
          <Route path="/box" element={<div>서랍 화면</div>} />
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: '메인으로' }))
    expect(await screen.findByText('서랍 화면')).toBeTruthy()
  })
  it('서버가 준 질문을 보여 준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      items: [{ id: 'x', question: '새 질문', answerMd: '새 답', buttons: [] }], contact: '새 문의처',
    }), { status: 200 })))
    render(<MemoryRouter initialEntries={['/help']}><Routes><Route path="/help" element={<HelpPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('새 질문')).toBeTruthy()
    expect(screen.getByText('새 문의처')).toBeTruthy()
    expect(screen.queryByText('문자가 안 와요')).toBeNull()
  })
  it('불러오기에 실패하면 기본 질문 5개를 그대로 보여 준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<MemoryRouter initialEntries={['/help']}><Routes><Route path="/help" element={<HelpPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('문자가 안 와요')).toBeTruthy()
    expect(screen.getByText('이런 문자는 서랍이 보내지 않아요')).toBeTruthy()
  })
  // 최종 검토 ④: 불러오는 동안 기본 질문을 먼저 보이면, 관리자가 숨긴 질문이 잠깐 비친다
  it('불러오는 동안에는 기본 질문을 보이지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<MemoryRouter initialEntries={['/help']}><Routes><Route path="/help" element={<HelpPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('도움말')).toBeTruthy()
    expect(screen.queryByText('문자가 안 와요')).toBeNull()
  })
})
