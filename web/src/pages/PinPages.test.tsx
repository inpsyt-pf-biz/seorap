import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@core/copy.ko.ts'
import EntryPage from './EntryPage'
import PinSetPage from './PinSetPage'
import { tokens } from '../theme/seorap'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const TOKEN = 'A'.repeat(32)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const entryBody = (over: Record<string, unknown> = {}) =>
  ({ nameMasked: '홍*동', phoneMasked: '010-****-5678', noticeBanner: null, hasPin: false, pinLocked: false, ...over })

// 경로별 응답. 부른 경로와 본문을 순서대로 남긴다
function stubApi(routes: Record<string, (body: any) => Response>) {
  const calls: { path: string; body: any }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^\/api\//, '')
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ path, body })
    const route = routes[path]
    if (!route) throw new Error(`unexpected call: ${path}`)
    return route(body)
  }))
  return calls
}

function openAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/box" element={<p>서랍 화면</p>} />
        <Route path="/pin" element={<PinSetPage />} />
        <Route path="/:token" element={<EntryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('진입: PIN', () => {
  it('PIN 을 정한 서랍은 PIN 입력부터 보이고, 맞으면 서랍으로 간다 (문자 요청 없음)', async () => {
    const calls = stubApi({ entry: () => json(200, entryBody({ hasPin: true })), 'pin/verify': () => json(200, { ok: true }) })
    openAt(`/${TOKEN}`)
    const input = await screen.findByLabelText(t('pin.enter'))
    await userEvent.type(input, '135792')
    await userEvent.click(screen.getByRole('button', { name: t('common.confirm') }))
    await screen.findByText('서랍 화면')
    expect(calls.map((c) => c.path)).toEqual(['entry', 'pin/verify'])
    expect(calls[1].body).toEqual({ token: TOKEN, pin: '135792' })
  })

  it('틀리면 남은 횟수를 보이고 입력을 비운다', async () => {
    stubApi({
      entry: () => json(200, entryBody({ hasPin: true })),
      'pin/verify': () => json(400, { error: { code: 'PIN_WRONG', extra: { remaining: 3 } } }),
    })
    openAt(`/${TOKEN}`)
    const input = await screen.findByLabelText(t('pin.enter'))
    await userEvent.type(input, '000001')
    await userEvent.click(screen.getByRole('button', { name: t('common.confirm') }))
    await screen.findByText(t('pin.wrong', { n: 3 }))
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('잠기면 인증번호 받기로 바뀐다', async () => {
    stubApi({
      entry: () => json(200, entryBody({ hasPin: true })),
      'pin/verify': () => json(423, { error: { code: 'PIN_LOCKED' } }),
    })
    openAt(`/${TOKEN}`)
    await userEvent.type(await screen.findByLabelText(t('pin.enter')), '000001')
    await userEvent.click(screen.getByRole('button', { name: t('common.confirm') }))
    await screen.findByText(t('pin.locked'))
    expect(screen.getByRole('button', { name: t('entry.button') })).toBeTruthy()
  })

  it('이미 잠긴 서랍은 처음부터 인증번호 받기와 잠김 안내', async () => {
    stubApi({ entry: () => json(200, entryBody({ hasPin: true, pinLocked: true })) })
    openAt(`/${TOKEN}`)
    await screen.findByText(t('pin.locked'))
    expect(screen.queryByLabelText(t('pin.enter'))).toBeNull()
    expect(screen.getByRole('button', { name: t('entry.button') })).toBeTruthy()
  })

  it('[PIN을 잊었어요]를 누르면 인증번호 받기로', async () => {
    stubApi({ entry: () => json(200, entryBody({ hasPin: true })) })
    openAt(`/${TOKEN}`)
    await userEvent.click(await screen.findByRole('button', { name: t('pin.forgot') }))
    expect(screen.getByRole('button', { name: t('entry.button') })).toBeTruthy()
  })

  it('OTP 를 통과하면 PIN 설정으로 간다', async () => {
    stubApi({
      entry: () => json(200, entryBody()),
      'otp/request': () => json(200, { expiresAt: new Date(Date.now() + 180_000).toISOString(), resendAt: new Date(Date.now() + 60_000).toISOString() }),
      'otp/verify': () => json(200, { ok: true }),
    })
    openAt(`/${TOKEN}`)
    await userEvent.click(await screen.findByRole('button', { name: t('entry.button') }))
    await userEvent.type(await screen.findByLabelText(t('otp.title')), '123456')
    await userEvent.click(screen.getByRole('button', { name: t('otp.submit') }))
    await screen.findByText(t('pin.set.title'))
  })
})

describe('PIN 설정', () => {
  const typeAndPress = async (label: string, value: string, button: string) => {
    await userEvent.type(await screen.findByLabelText(label), value)
    await userEvent.click(screen.getByRole('button', { name: button }))
  }

  it('두 번 같은 PIN 을 넣으면 저장하고 서랍으로', async () => {
    const calls = stubApi({ 'pin/set': () => json(200, { ok: true }) })
    openAt('/pin')
    await typeAndPress(t('pin.set.title'), '135792', t('pin.set.next'))
    await typeAndPress(t('pin.set.again'), '135792', t('pin.set.done'))
    await screen.findByText('서랍 화면')
    expect(calls).toEqual([{ path: 'pin/set', body: { pin: '135792' } }])
  })

  it('쉬운 PIN 은 서버에 보내지 않고 바로 안내', async () => {
    const calls = stubApi({})
    openAt('/pin')
    await typeAndPress(t('pin.set.title'), '123456', t('pin.set.next'))
    await screen.findByText(t('pin.set.weak'))
    expect(calls).toEqual([])
  })

  it('두 번이 다르면 처음부터 다시', async () => {
    const calls = stubApi({})
    openAt('/pin')
    await typeAndPress(t('pin.set.title'), '135792', t('pin.set.next'))
    await typeAndPress(t('pin.set.again'), '135793', t('pin.set.done'))
    await screen.findByText(t('pin.set.mismatch'))
    expect(screen.getByLabelText(t('pin.set.title'))).toBeTruthy()
    expect(calls).toEqual([])
  })

  it('OTP 를 한 지 오래되면 다시 들어오라고 안내', async () => {
    stubApi({ 'pin/set': () => json(401, { error: { code: 'REAUTH_REQUIRED', extra: { reason: 'otp_required' } } }) })
    openAt('/pin')
    await typeAndPress(t('pin.set.title'), '135792', t('pin.set.next'))
    await typeAndPress(t('pin.set.again'), '135792', t('pin.set.done'))
    await waitFor(() => expect(screen.getByText(t('pin.set.expired'))).toBeTruthy())
  })
})

describe('입장 화면 (75:20:5: 종이 바탕, 10-30)', () => {
  it('진입(인증번호·비밀번호) 화면은 종이 바탕이고, 로고는 종이 바탕용(청록 몸체)이다', async () => {
    stubApi({ entry: () => json(200, entryBody({ hasPin: true })) })
    openAt(`/${TOKEN}`)
    await screen.findByLabelText(t('pin.enter'))
    expect(document.querySelector('[data-surface]')).toBeNull()
    expect(document.querySelector('[data-part="logo-body"]')?.getAttribute('fill')).toBe(tokens.teal[700])
  })
  it('비밀번호 설정 화면도 종이 바탕이다', async () => {
    openAt('/pin')
    await screen.findByLabelText(t('pin.set.title'))
    expect(document.querySelector('[data-surface]')).toBeNull()
  })
})
