import { afterEach, describe, expect, it, vi } from 'vitest'
import { openInNewWindow } from './openInNewWindow'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function fakeWindow() {
  const hrefs: string[] = []
  const win = { opener: {} as unknown, close: vi.fn(), location: { set href(v: string) { hrefs.push(v) } } }
  return { win, hrefs }
}

describe('openInNewWindow (실시하기를 새 창으로)', () => {
  it('주소를 기다리기 전에 빈 창부터 연다 (기다린 뒤 열면 휴대폰 브라우저가 팝업으로 막는다)', async () => {
    const { win, hrefs } = fakeWindow()
    const open = vi.fn(() => win)
    vi.stubGlobal('open', open)
    let resolve: (u: string) => void = () => {}
    const p = openInNewWindow(() => new Promise<string>((r) => { resolve = r }))
    expect(open).toHaveBeenCalledWith('', '_blank')
    resolve('https://exam.test/start')
    await p
    expect(hrefs).toEqual(['https://exam.test/start'])
    expect(win.opener).toBeNull()
  })

  it('창을 열 수 없으면(차단·인앱 제한) 지금 창에서 연다', async () => {
    vi.stubGlobal('open', vi.fn(() => null))
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    await openInNewWindow(async () => 'https://exam.test/start')
    expect(assign).toHaveBeenCalledWith('https://exam.test/start')
  })

  it('주소를 받지 못하면 빈 창을 닫고 오류를 그대로 넘긴다', async () => {
    const { win } = fakeWindow()
    vi.stubGlobal('open', vi.fn(() => win))
    await expect(openInNewWindow(async () => { throw new Error('UPSTREAM') })).rejects.toThrow('UPSTREAM')
    expect(win.close).toHaveBeenCalled()
  })
})
