import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@core/copy.ko.ts'
import HelpPage from './HelpPage'
import ReceiverPage from './ReceiverPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const TOKEN = 'B'.repeat(32)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const PAGE = { senderName: '홍*동', testName: 'STS 성인 기질검사', launched: false, contact: '문의: 톡톡' }

function stubApi(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = url.replace(/^\/api\//, '')
    calls.push(path)
    const route = routes[path]
    if (!route) throw new Error(`unexpected call: ${path}`)
    return route()
  }))
  return calls
}
const open = (path = `/f/${TOKEN}`) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/f/:token" element={<ReceiverPage />} />
      <Route path="/help" element={<HelpPage />} />
    </Routes>
  </MemoryRouter>,
)

describe('받는 분 1매 화면', () => {
  it('보낸 분·검사명·문의처·사칭 주의가 보이고, 여는 것만으로는 page 만 부른다', async () => {
    const calls = stubApi({ 'forward/page': () => json(200, PAGE) })
    open()
    await screen.findByText(t('receiver.from', { name: '홍*동' }))
    expect(screen.getByText('STS 성인 기질검사')).toBeTruthy()
    expect(screen.getByText('문의: 톡톡')).toBeTruthy()
    expect(screen.getByText(t('receiver.scam'))).toBeTruthy()
    expect(calls).toEqual(['forward/page'])
  })

  it('[실시하기]는 검사 주소를 새 창으로 열고, 연타해도 한 번만 부른다', async () => {
    const assign = vi.fn()
    vi.stubGlobal('open', vi.fn(() => ({ opener: {}, close: vi.fn(), location: { set href(v: string) { assign(v) } } })))
    let release: (r: Response) => void = () => {}
    const calls = stubApi({
      'forward/page': () => json(200, PAGE),
      'forward/launch': () => new Promise<Response>((resolve) => { release = resolve }),
    })
    open()
    const button = await screen.findByRole('button', { name: t('action.launch') })
    await userEvent.click(button)
    // 처리 중에는 버튼이 꺼진다. 꺼진 버튼에 들어오는 탭도 ref 잠금이 한 번 더 막는다
    fireEvent.click(button)
    await act(async () => release(json(200, { url: 'https://example.test/run/CODE' })))
    expect(calls.filter((c) => c === 'forward/launch').length).toBe(1)
    expect(assign).toHaveBeenCalledWith('https://example.test/run/CODE')
  })

  it('이미 실시했으면 [이어서 하기]', async () => {
    stubApi({ 'forward/page': () => json(200, { ...PAGE, launched: true }) })
    open()
    expect(await screen.findByRole('button', { name: t('action.continue') })).toBeTruthy()
  })

  it('더보기 > 코드 보기는 코드와 PC 안내를 창으로 보인다', async () => {
    stubApi({ 'forward/page': () => json(200, PAGE), 'forward/code': () => json(200, { code: 'ABCD-1234' }) })
    open()
    await userEvent.click(await screen.findByText(t('forward.more')))
    await userEvent.click(screen.getByRole('button', { name: t('receiver.codePc') }))
    expect(await screen.findByText(/ABCD-1234/)).toBeTruthy()
  })

  it('막힌 링크는 사유별 문장과 도움말 링크', async () => {
    stubApi({ 'forward/page': () => json(410, { error: { code: 'LINK_REVOKED', extra: { reason: 'reforwarded' } } }) })
    open()
    expect(await screen.findByText(t('forward.revoked.reforwarded'))).toBeTruthy()
    expect(screen.getByRole('link', { name: t('help.title') })).toBeTruthy()
  })

  it('모르는 사유는 일반 문장', async () => {
    stubApi({ 'forward/page': () => json(410, { error: { code: 'LINK_REVOKED', extra: { reason: 'phone_changed' } } }) })
    open()
    expect(await screen.findByText(t('state.linkRevoked'))).toBeTruthy()
  })

  it('실시하려는 순간 막혔으면(그사이 전달 취소) 막힌 화면으로 바뀐다', async () => {
    stubApi({
      'forward/page': () => json(200, PAGE),
      'forward/launch': () => json(410, { error: { code: 'LINK_REVOKED', extra: { reason: 'forward_cancelled' } } }),
    })
    open()
    await userEvent.click(await screen.findByRole('button', { name: t('action.launch') }))
    expect(await screen.findByText(t('forward.revoked.forward_cancelled'))).toBeTruthy()
  })

  it('형식이 다른 토큰은 서버를 부르지 않고 404 화면', async () => {
    const calls = stubApi({})
    open('/f/short')
    expect(await screen.findByText(t('state.notFound'))).toBeTruthy()
    expect(calls).toEqual([])
  })
})

describe('도움말', () => {
  it('질문 5개와 문의처', async () => {
    stubApi({ help: () => json(200, { contact: '문의: 톡톡' }) })
    open('/help')
    // 옛 서버 응답(문의처만)이면 기본 질문 + 받은 문의처. 응답이 온 뒤에 그린다
    expect(await screen.findByText('문의: 톡톡')).toBeTruthy()
    for (const q of ['help.q.noSms', 'help.q.lostLink', 'help.q.cancel', 'help.q.result', 'help.q.scam'] as const) {
      expect(screen.getByText(t(q))).toBeTruthy()
    }
  })

  it('문의처를 못 불러와도 본문은 보인다', async () => {
    stubApi({ help: () => json(502, { error: { code: 'UPSTREAM_FAILED' } }) })
    open('/help')
    expect(await screen.findByText(t('help.q.cancel'))).toBeTruthy()
  })
})
