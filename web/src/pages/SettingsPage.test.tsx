import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from './SettingsPage'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const GENERIC = '잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요'

function open() {
  render(
    <MemoryRouter initialEntries={['/box/settings']}>
      <Routes>
        <Route path="/" element={<div>첫 화면</div>} />
        <Route path="/box" element={<div>서랍 화면</div>} />
        <Route path="/box/settings" element={<SettingsPage />} />
        <Route path="/box/settings/pin" element={<div>비밀번호 화면</div>} />
        <Route path="/box/settings/nickname" element={<div>닉네임 화면</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// 설정 (10-30 검수): 비밀번호 바꾸기, 닉네임 설정, 로그아웃. 나의 종합 보고서는 추후 오픈이라 아직 보이지 않는다
describe('SettingsPage', () => {
  it('비밀번호 바꾸기·닉네임 설정(전달할 때 표시된다는 설명 포함)이 있고, 종합 보고서는 아직 없다', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: /비밀번호 바꾸기/ }))
    expect(await screen.findByText('비밀번호 화면')).toBeTruthy()
  })
  it('닉네임 설정으로 간다, 설명에 "검사를 전달할 때" 표시된다고 적혀 있다', async () => {
    open()
    expect(screen.getByText('검사를 전달할 때 받는 분에게 보여요')).toBeTruthy()
    expect(screen.queryByText(/종합 보고서/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /닉네임 설정/ }))
    expect(await screen.findByText('닉네임 화면')).toBeTruthy()
  })
  it('[메인으로]는 서랍으로 간다', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: '메인으로' }))
    expect(await screen.findByText('서랍 화면')).toBeTruthy()
  })
  it('로그아웃하면 첫 화면으로 간다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { ok: true })))
    open()
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(await screen.findByText('첫 화면')).toBeTruthy()
  })
  it('로그아웃이 실패하면 첫 화면으로 가지 않고 오류를 알린다 (함께 쓰는 휴대폰에서 서랍이 열린 채 남지 않게)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(502, { error: { code: 'UPSTREAM_FAILED' } })))
    open()
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(await screen.findByText(GENERIC)).toBeTruthy()
    expect(screen.queryByText('첫 화면')).toBeNull()
  })
})
