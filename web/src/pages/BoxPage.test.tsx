import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoxLine, BoxResponse } from '@core/apiTypes.ts'
import BoxPage from './BoxPage'

// vitest 에 globals 가 없어 RTL 의 자동 정리가 꺼져 있다. 테스트마다 직접 비우고, 가짜 fetch·location 도 되돌린다.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

const launchable: BoxLine = {
  voucherId: 'v1', testItemId: 'T', testName: 'STS 성인 기질검사', unitNo: 1, unitsOfTest: 1, firstLaunchedAt: null, forwardTo: null,
  status: { label: '실시 전', tone: 'neutral', actions: ['launch', 'forward'] },
}
const forwarded: BoxLine = {
  ...launchable, voucherId: 'v2',
  forwardTo: { name: '홍길동', phone: '010-1234-5678' },
  status: { label: '전달함 · 홍길동', tone: 'info', actions: ['resend', 'reforward'] },
}
const boxOf = (lines: BoxLine[]): BoxResponse => ({
  ownerName: '김서랍', notStartedCount: lines.length, noticeBanner: null,
  groups: [{ orderId: 'o1', purchasedAt: '2026-10-01T00:00:00.000Z', productName: 'STS', lineCount: lines.length, done: false, lines }],
})

// 경로별로 응답을 정하는 가짜 fetch. 서랍 조회는 항상 같은 서랍을 돌려준다.
function stubApi(lines: BoxLine[], routes: Record<string, () => Promise<Response>>) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = url.replace(/^\/api\//, '')
    calls.push(path)
    if (path === 'box') return json(200, boxOf(lines))
    const route = routes[path]
    if (!route) throw new Error(`unexpected call: ${path}`)
    return route()
  }))
  return calls
}
const count = (calls: string[], path: string) => calls.filter((c) => c === path).length

function open() {
  render(<MemoryRouter><BoxPage /></MemoryRouter>)
}

describe('BoxPage 처리 중 잠금', () => {
  it('실시하기 연타는 한 번만 부르고, 성공한 뒤에는 이동 중이라 계속 잠근다', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    let release: (r: Response) => void = () => {}
    const calls = stubApi([launchable], {
      'voucher/launch': () => new Promise<Response>((resolve) => { release = resolve }),
    })
    open()
    const launch = await screen.findByRole('button', { name: '실시하기' })
    // 화면이 다시 그려지기 전에 두 번째 탭이 들어오는 연타를 한 번의 act 안에서 흉내 낸다
    act(() => { launch.click(); launch.click() })
    expect(count(calls, 'voucher/launch')).toBe(1)
    await act(async () => { release(json(200, { url: 'https://exam.test/start' })) })
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://exam.test/start'))
    await userEvent.click(screen.getByRole('button', { name: '실시하기' }))
    expect(count(calls, 'voucher/launch')).toBe(1)
  })

  it('실패하면 잠금이 풀려 다시 누를 수 있다', async () => {
    const calls = stubApi([launchable], {
      'voucher/launch': async () => json(500, { error: { code: 'UPSTREAM_FAILED' } }),
    })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '실시하기' }))
    expect(await screen.findByText('잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '실시하기' }))
    await waitFor(() => expect(count(calls, 'voucher/launch')).toBe(2))
  })

  it('다시 보내기 확인을 연타해도 한 번만 보낸다', async () => {
    const calls = stubApi([forwarded], {
      'forward/resend': async () => json(200, { forwardId: 'f1', created: true }),
    })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '다시 보내기' }))
    const confirm = await screen.findByRole('button', { name: '보내기' })
    act(() => { confirm.click(); confirm.click() })
    await waitFor(() => expect(count(calls, 'forward/resend')).toBe(1))
  })
})

describe('BoxPage 다시 보내기 결과 안내', () => {
  it('성공하면 받는 분 이름과 함께 성공 안내를 보인다', async () => {
    stubApi([forwarded], { 'forward/resend': async () => json(200, { forwardId: 'f1', created: true }) })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '다시 보내기' }))
    await userEvent.click(await screen.findByRole('button', { name: '보내기' }))
    const text = await screen.findByText('홍길동님께 보냈어요')
    expect(text.closest('[role="alert"]')?.className).toContain('MuiAlert-colorSuccess')
  })

  it('실패하면 경고 안내를 보이고 성공 안내는 없다', async () => {
    stubApi([forwarded], { 'forward/resend': async () => json(500, { error: { code: 'UPSTREAM_FAILED' } }) })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '다시 보내기' }))
    await userEvent.click(await screen.findByRole('button', { name: '보내기' }))
    const text = await screen.findByText('잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요')
    expect(text.closest('[role="alert"]')?.className).toContain('MuiAlert-colorWarning')
    expect(screen.queryByText('홍길동님께 보냈어요')).toBeNull()
  })
})
