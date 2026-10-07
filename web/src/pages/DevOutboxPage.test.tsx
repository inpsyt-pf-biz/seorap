import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DevOutboxPage from './DevOutboxPage'

// vitest 에 globals 가 없어 RTL 의 자동 정리가 꺼져 있다. 테스트마다 직접 비우고, 가짜 fetch·환경값도 되돌린다.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
type FetchMock = ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>
const headersOf = (m: FetchMock) => (m.mock.calls[0][1].headers ?? {}) as Record<string, string>

describe('DevOutboxPage', () => {
  it('VITE_SEORAP_DEV_OUTBOX_KEY 가 있으면 X-Seorap-Dev-Key 머리글로 보낸다', async () => {
    vi.stubEnv('VITE_SEORAP_DEV_OUTBOX_KEY', 'preview-key')
    const fetchMock: FetchMock = vi.fn(async () => json(200, { items: [] }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DevOutboxPage />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/dev/outbox')
    expect(headersOf(fetchMock)['X-Seorap-Dev-Key']).toBe('preview-key')
  })

  it('키가 없으면(로컬) 머리글을 붙이지 않는다', async () => {
    vi.stubEnv('VITE_SEORAP_DEV_OUTBOX_KEY', '')
    const fetchMock: FetchMock = vi.fn(async () => json(200, { items: [] }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DevOutboxPage />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect('X-Seorap-Dev-Key' in headersOf(fetchMock)).toBe(false)
  })

  it('거절되면 오류 코드를 개발용 글자로 보인다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(403, { error: { code: 'FORBIDDEN' } })))
    render(<DevOutboxPage />)
    expect(await screen.findByText('error: FORBIDDEN')).toBeTruthy()
  })
})
