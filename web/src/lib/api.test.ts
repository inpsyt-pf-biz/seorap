import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'

afterEach(() => {
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
})
