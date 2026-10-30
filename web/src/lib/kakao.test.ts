import { afterEach, describe, expect, it, vi } from 'vitest'
import { KAKAO_SDK, loadKakao, resetKakaoForTest } from './kakao'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  resetKakaoForTest()
  document.head.querySelectorAll('script[data-kakao-sdk]').forEach((s) => s.remove())
})

describe('loadKakao', () => {
  it('키가 없으면 SDK 를 부르지 않고 false', async () => {
    vi.stubEnv('VITE_KAKAO_JS_KEY', '')
    expect(await loadKakao()).toBe(false)
    expect(document.head.querySelector('script[data-kakao-sdk]')).toBeNull()
  })

  it('SDK 가 이미 있으면 키로 한 번만 초기화하고 true', async () => {
    vi.stubEnv('VITE_KAKAO_JS_KEY', 'k1')
    let inited = false
    const init = vi.fn(() => { inited = true })
    vi.stubGlobal('Kakao', { isInitialized: () => inited, init, Share: { sendDefault: vi.fn() } })
    expect(await loadKakao()).toBe(true)
    expect(await loadKakao()).toBe(true)
    expect(init).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledWith('k1')
  })

  // 실제 SDK 2.x 는 init 하기 전에는 Kakao.Share 가 없다 (10-30 로컬 확인)
  it('Share 가 init 뒤에야 붙는 SDK 도 초기화하고 true', async () => {
    vi.stubEnv('VITE_KAKAO_JS_KEY', 'k1')
    const k: Record<string, unknown> = { isInitialized: () => 'Share' in k }
    k.init = vi.fn(() => { k.Share = { sendDefault: vi.fn() } })
    vi.stubGlobal('Kakao', k)
    expect(await loadKakao()).toBe(true)
    expect(k.init).toHaveBeenCalledWith('k1')
  })

  it('SDK 는 고정 버전 주소를 무결성 해시와 함께 불러온다', async () => {
    vi.stubEnv('VITE_KAKAO_JS_KEY', 'k1')
    const p = loadKakao()
    const s = document.head.querySelector('script[data-kakao-sdk]') as HTMLScriptElement
    expect(s.src).toBe(KAKAO_SDK.src)
    expect(s.src).toMatch(/kakao_js_sdk\/\d+\.\d+\.\d+\/kakao\.min\.js$/)
    expect(s.integrity).toBe(KAKAO_SDK.integrity)
    expect(s.crossOrigin).toBe('anonymous')
    vi.stubGlobal('Kakao', { isInitialized: () => false, init: vi.fn(), Share: { sendDefault: vi.fn() } })
    s.dispatchEvent(new Event('load'))
    expect(await p).toBe(true)
  })

  it('SDK 를 못 불러오면 false, 다음에 다시 시도할 수 있다', async () => {
    vi.stubEnv('VITE_KAKAO_JS_KEY', 'k1')
    const p = loadKakao()
    document.head.querySelector('script[data-kakao-sdk]')!.dispatchEvent(new Event('error'))
    expect(await p).toBe(false)
    void loadKakao()
    expect(document.head.querySelectorAll('script[data-kakao-sdk]').length).toBe(1)
  })
})
