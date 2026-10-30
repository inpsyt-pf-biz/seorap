import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@core/copy.ko.ts'
import PinChangePage from './PinChangePage'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

function open(respond: (body: any) => Response) {
  const calls: any[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    calls.push(body)
    return respond(body)
  }))
  render(
    <MemoryRouter initialEntries={['/box/settings/pin']}>
      <Routes>
        <Route path="/box/settings" element={<div>설정 화면</div>} />
        <Route path="/box/settings/pin" element={<PinChangePage />} />
      </Routes>
    </MemoryRouter>,
  )
  return calls
}

const enter = async (label: string, value: string, button: string) => {
  await userEvent.type(await screen.findByLabelText(label), value)
  await userEvent.click(screen.getByRole('button', { name: button }))
}

describe('PinChangePage (비밀번호 바꾸기)', () => {
  it('지금 비밀번호 → 새 비밀번호 두 번을 받아 한 번에 바꾸고 설정으로 돌아간다', async () => {
    const calls = open(() => json(200, { ok: true }))
    await enter(t('pin.change.current'), '135792', t('pin.set.next'))
    await enter(t('pin.change.next'), '246813', t('pin.set.next'))
    await enter(t('pin.set.again'), '246813', t('pin.change.done'))
    expect(await screen.findByText('설정 화면')).toBeTruthy()
    expect(calls).toEqual([{ current: '135792', next: '246813' }])
  })
  it('새 비밀번호 두 번이 다르면 서버를 부르지 않고 새 비밀번호부터 다시 받는다', async () => {
    const calls = open(() => json(200, { ok: true }))
    await enter(t('pin.change.current'), '135792', t('pin.set.next'))
    await enter(t('pin.change.next'), '246813', t('pin.set.next'))
    await enter(t('pin.set.again'), '246814', t('pin.change.done'))
    expect(await screen.findByText(t('pin.set.mismatch'))).toBeTruthy()
    expect(screen.getByLabelText(t('pin.change.next'))).toBeTruthy()
    expect(calls).toEqual([])
  })
  it('지금 비밀번호가 틀리면 남은 횟수를 알리고 처음부터', async () => {
    open(() => json(401, { error: { code: 'PIN_WRONG', extra: { remaining: 3 } } }))
    await enter(t('pin.change.current'), '135792', t('pin.set.next'))
    await enter(t('pin.change.next'), '246813', t('pin.set.next'))
    await enter(t('pin.set.again'), '246813', t('pin.change.done'))
    expect(await screen.findByText(t('pin.wrong', { n: 3 }))).toBeTruthy()
    expect(screen.getByLabelText(t('pin.change.current'))).toBeTruthy()
  })
})
