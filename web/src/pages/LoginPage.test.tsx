import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@core/copy.ko.ts'
import LoginPage from './LoginPage'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
function stub(res: () => Response) {
  const calls: { path: string; body: any }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ path: url.replace(/^\/api\//, ''), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return res()
  }))
  return calls
}
const open = (state?: unknown) => render(
  <MemoryRouter initialEntries={[{ pathname: '/', state }]}>
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/box" element={<div>서랍 화면</div>} />
    </Routes>
  </MemoryRouter>,
)
const fill = async (pin = '135792') => {
  await userEvent.type(screen.getByLabelText(t('login.name')), '김철수')
  await userEvent.type(screen.getByLabelText(t('login.phone')), '01055556666')
  await userEvent.type(screen.getByLabelText(t('login.pin')), pin)
}

describe('로그인 화면 (이름·휴대전화번호·비밀번호)', () => {
  it('셋을 다 채워야 들어가기가 켜지고, 번호는 하이픈을 넣어 보여 주며 숫자만 보낸다', async () => {
    const calls = stub(() => json(200, { ok: true }))
    open()
    const go = screen.getByRole('button', { name: t('login.submit') }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    await fill()
    expect((screen.getByLabelText(t('login.phone')) as HTMLInputElement).value).toBe('010-5555-6666')
    expect(go.disabled).toBe(false)
    await userEvent.click(go)
    expect(await screen.findByText('서랍 화면')).toBeTruthy()
    expect(calls).toEqual([{ path: 'login', body: { name: '김철수', phone: '01055556666', pin: '135792' } }])
  })

  it('틀리면 무엇이 틀렸는지 말하지 않는 한 문장을 보이고 비밀번호 칸을 비운다', async () => {
    stub(() => json(401, { error: { code: 'LOGIN_FAILED', extra: {} } }))
    open()
    await fill()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByText(t('login.failed'))).toBeTruthy()
    expect((screen.getByLabelText(t('login.pin')) as HTMLInputElement).value).toBe('')
  })

  it('시도가 너무 많으면 기다리라고 안내한다', async () => {
    stub(() => json(429, { error: { code: 'RATE_LIMITED', extra: { reason: 'login_ip' } } }))
    open()
    await fill()
    await userEvent.click(screen.getByRole('button', { name: t('login.submit') }))
    expect(await screen.findByText(t('login.rateLimited'))).toBeTruthy()
  })

  it('로그아웃하고 오면 로그아웃 안내를 위에 보이고, 처음 오는 분·잊은 분의 길도 적어 둔다', () => {
    stub(() => json(200, {}))
    open({ loggedOut: true })
    expect(screen.getByText(t('login.loggedOut'))).toBeTruthy()
    expect(screen.getByText(t('login.first'))).toBeTruthy()
    expect(screen.getByText(t('login.forgot'))).toBeTruthy()
  })
})
