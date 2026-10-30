import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HelpPage from './HelpPage'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('HelpPage', () => {
  it('[메인으로]로 왔던 화면(서랍)으로 돌아간다 (10-30 검수: 도움말에서 돌아갈 길이 없음)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ contact: '문의' }), { status: 200 })))
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ contact: '문의' }), { status: 200 })))
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
})
