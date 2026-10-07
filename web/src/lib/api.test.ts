import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, isSessionEnd } from './api'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('api', () => {
  it('성공하면 JSON을 돌려준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
    expect(await api<{ ok: boolean }>('box')).toEqual({ ok: true })
  })
  it('오류면 ApiError(code, extra)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'OTP_WRONG', extra: { remaining: 2 } } }), { status: 400 })))
    await expect(api('otp/verify', { code: '000000' })).rejects.toMatchObject({ code: 'OTP_WRONG', status: 400, extra: { remaining: 2 } })
  })
  it('JSON이 아닌 응답은 UPSTREAM_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad Gateway', { status: 502 })))
    const e = (await api('box').catch((x) => x)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.code).toBe('UPSTREAM_FAILED')
  })
  it('전송 자체가 실패하면(fetch 거부) status 0 인 UPSTREAM_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const e = (await api('box').catch((x) => x)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.code).toBe('UPSTREAM_FAILED')
    expect(e.status).toBe(0)
  })
  it('오류 응답의 본문이 null 이어도 UPSTREAM_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 500 })))
    const e = (await api('box').catch((x) => x)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.code).toBe('UPSTREAM_FAILED')
    expect(e.status).toBe(500)
  })
  it('15초 안에 응답이 없으면 요청을 끊고 status 0 인 UPSTREAM_FAILED', async () => {
    vi.useFakeTimers()
    // 끝내 응답하지 않지만 중단 신호는 지키는 fetch
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    let settled = false
    const result = api('box').catch((x) => x).finally(() => { settled = true })
    await vi.advanceTimersByTimeAsync(14_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const e = (await result) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.code).toBe('UPSTREAM_FAILED')
    expect(e.status).toBe(0)
  })
  it('세 번째 인자의 머리글을 붙이고, POST 의 Content-Type 은 그대로 둔다', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await api('dev/outbox', undefined, { headers: { 'X-Seorap-Dev-Key': 'k1' } })
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'X-Seorap-Dev-Key': 'k1' })
    await api('entry', { token: 't' }, { headers: { 'X-Extra': 'e' } })
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ 'Content-Type': 'application/json', 'X-Extra': 'e' })
    await api('entry', { token: 't' })
    expect(fetchMock.mock.calls[2][1].headers).toEqual({ 'Content-Type': 'application/json' })
  })
  it('세션 끝은 코드(SESSION_EXPIRED·REAUTH_REQUIRED)로만 판단한다. 맨 401(게이트웨이 등)은 아니다', () => {
    expect(isSessionEnd(new ApiError('SESSION_EXPIRED', 401))).toBe(true)
    expect(isSessionEnd(new ApiError('REAUTH_REQUIRED', 401))).toBe(true)
    expect(isSessionEnd(new ApiError('UPSTREAM_FAILED', 401))).toBe(false)
    expect(isSessionEnd(new Error('x'))).toBe(false)
  })
  it('응답이 오면 제한 시간 타이머를 치운다', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
    await api('box')
    expect(vi.getTimerCount()).toBe(0)
  })
})
