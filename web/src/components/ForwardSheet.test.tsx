import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoxLine } from '@core/apiTypes.ts'
import { resetKakaoForTest } from '../lib/kakao'
import { tokens } from '../theme/seorap'
import ForwardSheet from './ForwardSheet'

const line: BoxLine = {
  voucherId: 'v1', testItemId: 'T', testName: 'GOLDEN 성격유형검사', unitNo: 2, unitsOfTest: 2, firstLaunchedAt: null, forwardTo: null,
  recipientLabels: ['친구', '연인', '배우자', '가족'],
  status: { label: '실시 전', tone: 'neutral', actions: ['launch', 'forward'] },
}
// vitest 에 globals 가 없어 RTL 의 자동 정리가 꺼져 있다. 테스트마다 직접 비우고, 가짜 fetch·클립보드·공유 창·카카오도 되돌린다.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetKakaoForTest()
  Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(navigator, 'share')
})

const noop = () => {}
const GENERIC = '잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요'
const URL_ = 'https://seorap.test/f/abc'
const TEXT = `[인싸이트 서랍] 홍*동님이 심리검사를 보냈어요. ${URL_}`
const KAKAO_TEXT = '[인싸이트 서랍] 홍*동님이 심리검사를 보냈어요. 아래 [검사 열기]를 눌러 시작해 주세요'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const ok = () => json(200, { url: URL_, text: TEXT, kakaoText: KAKAO_TEXT })

// 서버 호출을 기록하는 가짜 fetch
function server(res: () => Response = ok) {
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return res() }))
  return bodies
}
function share(impl: () => Promise<void> = async () => {}) {
  const fn = vi.fn(impl)
  Object.defineProperty(navigator, 'share', { value: fn, configurable: true })
  return fn
}
function kakao() {
  const sendDefault = vi.fn()
  vi.stubEnv('VITE_KAKAO_JS_KEY', 'test-key')
  vi.stubGlobal('Kakao', { isInitialized: () => true, init: vi.fn(), Share: { sendDefault } })
  return sendDefault
}
const open = (props: Partial<Parameters<typeof ForwardSheet>[0]> = {}) =>
  render(<ForwardSheet line={line} onClose={noop} onDone={noop} onExpired={noop} {...props} />)

describe('ForwardSheet', () => {
  // 시트가 브라우저 전체 폭으로 퍼지지 않고, 주 컬럼 폭 안에서 가운데에 놓인다 (폰에서는 꽉 찬다)
  it('시트 바깥 틀은 주 컬럼 폭을 넘지 않고 가운데에 놓이며 윗모서리가 둥글다', () => {
    open()
    const paper = document.querySelector('.MuiDrawer-paper') as HTMLElement
    const css = getComputedStyle(paper)
    expect(css.maxWidth).toBe(`${tokens.layout.maxWidth}px`)
    expect(css.width).toBe('100%')
    expect([css.marginLeft, css.marginRight]).toEqual(['auto', 'auto'])
    expect([css.left, css.right]).toEqual(['0px', '0px'])
    expect([css.borderTopLeftRadius, css.borderTopRightRadius]).toEqual(['16px', '16px'])
  })

  it('그 검사의 호칭 목록과 [직접 입력]을 고를 수 있게 보이고, 번호 칸·[더보기]는 없다 (10-30)', () => {
    open()
    expect(screen.getByText('누구에게 보내나요? (선택)')).toBeTruthy()
    for (const label of ['친구', '연인', '배우자', '가족', '직접 입력']) expect(screen.getByRole('button', { name: label })).toBeTruthy()
    expect(screen.queryByLabelText('휴대폰 번호')).toBeNull()
    expect(screen.queryByRole('button', { name: '더보기' })).toBeNull()
    expect(screen.getByText(/링크를 받은 분은 누구나 검사를 시작할 수 있어요/)).toBeTruthy()
  })

  it('호칭 목록이 비어 있으면 [직접 입력]만 보인다', () => {
    open({ line: { ...line, recipientLabels: [] } })
    expect(screen.getAllByRole('button', { pressed: false }).map((b) => b.textContent)).toEqual(['직접 입력'])
  })

  it('고른 호칭을 다시 누르면 고르기가 풀린다', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: '연인' }))
    expect(screen.getByRole('button', { name: '연인' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: '연인' }))
    expect(screen.getByRole('button', { name: '연인' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('[직접 전달]: 호칭을 담아 링크를 만들고 휴대폰 공유 창에 문구를 넘긴 뒤, 성공 문구로 닫는다', async () => {
    const bodies = server()
    const sheet = share()
    const onDone = vi.fn()
    open({ onDone })
    await userEvent.click(screen.getByRole('button', { name: '연인' }))
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('연인에게 전달했어요'))
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ voucherId: 'v1', label: '연인', via: 'native' })
    expect(sheet).toHaveBeenCalledWith({ text: TEXT })
  })

  it('호칭을 고르지 않아도 보낼 수 있다 (호칭 없이 보내고 "전달했어요")', async () => {
    const bodies = server()
    share()
    const onDone = vi.fn()
    open({ onDone })
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('전달했어요'))
    expect(bodies[0].label ?? null).toBeNull()
  })

  it('[직접 입력]을 누르면 칸이 열리고, 적은 호칭으로 보낸다', async () => {
    const bodies = server()
    share()
    open()
    await userEvent.click(screen.getByRole('button', { name: '직접 입력' }))
    await userEvent.type(screen.getByLabelText('받는 분 호칭'), ' 할머니 ')
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].label).toBe('할머니')
  })

  it('[직접 입력]을 고르고 비워 두면 칸에 오류를 붙이고 서버를 부르지 않는다', async () => {
    const bodies = server()
    open()
    await userEvent.click(screen.getByRole('button', { name: '직접 입력' }))
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    expect(screen.getByText('호칭을 1~20자로 입력해 주세요')).toBeTruthy()
    expect(screen.getByLabelText('받는 분 호칭').getAttribute('aria-invalid')).toBe('true')
    expect(bodies).toHaveLength(0)
  })

  it('공유 창을 닫으면(취소) 같은 링크로 공유 창을 다시 열 수 있다. 링크는 새로 만들지 않는다', async () => {
    const bodies = server()
    let n = 0
    const sheet = share(async () => { n += 1; if (n === 1) throw new DOMException('cancel', 'AbortError') })
    const onDone = vi.fn()
    open({ onDone })
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    expect(await screen.findByText('링크를 만들었어요. 아직 보내지 않았다면 공유 창을 다시 열어 주세요')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '공유 창 다시 열기' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('전달했어요'))
    expect(sheet).toHaveBeenCalledTimes(2)
    expect(bodies).toHaveLength(1)
  })

  it('브라우저가 공유 창을 막으면(NotAllowedError) 한 번 더 누르게 한다', async () => {
    server()
    share(async () => { throw new DOMException('no gesture', 'NotAllowedError') })
    open()
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    expect(await screen.findByRole('button', { name: '공유 창 다시 열기' })).toBeTruthy()
  })

  it('공유 창이 없으면(PC) 문구를 복사하고 안내한다. 닫을 때 서랍을 새로 부른다', async () => {
    server()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const onDone = vi.fn()
    open({ onDone })
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    expect(await screen.findByText('링크를 복사했어요. 원하는 곳에 붙여넣어 주세요')).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith(TEXT)
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('공유 창도 없고 복사도 막히면 문구를 화면에 남겨 직접 복사할 수 있게 한다', async () => {
    server()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('denied') }) }, configurable: true })
    open()
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    expect(await screen.findByText(TEXT)).toBeTruthy()
  })

  it('[카카오톡으로 전달]: 카카오 공유에 글자 메시지와 [검사 열기] 버튼을 넘기고, 다시 열기·다 보냈어요를 둔다', async () => {
    const bodies = server()
    const sendDefault = kakao()
    const onDone = vi.fn()
    open({ onDone })
    await userEvent.click(screen.getByRole('button', { name: '배우자' }))
    await userEvent.click(await screen.findByRole('button', { name: '카카오톡으로 전달' }))
    await waitFor(() => expect(sendDefault).toHaveBeenCalledTimes(1))
    expect(bodies[0]).toMatchObject({ label: '배우자', via: 'kakao' })
    expect(sendDefault).toHaveBeenCalledWith({
      objectType: 'text', text: KAKAO_TEXT, link: { mobileWebUrl: URL_, webUrl: URL_ }, buttonTitle: '검사 열기',
    })
    expect(screen.getByText('카카오톡에서 받는 분을 골라 보내 주세요')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '카카오톡 다시 열기' }))
    expect(sendDefault).toHaveBeenCalledTimes(2)
    expect(bodies).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: '다 보냈어요' }))
    expect(onDone).toHaveBeenCalledWith('배우자에게 전달했어요')
  })

  it('카카오 키가 없으면 [카카오톡으로 전달]은 보이지 않고 [직접 전달]만 있다', async () => {
    open()
    await act(async () => {})
    expect(screen.queryByRole('button', { name: '카카오톡으로 전달' })).toBeNull()
    expect(screen.getByRole('button', { name: '직접 전달' })).toBeTruthy()
  })

  it('처리 중에 또 눌러도 서버 호출은 한 번이다', async () => {
    let release: (r: Response) => void = () => {}
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    share()
    open()
    const btn = screen.getByRole('button', { name: '직접 전달' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => { release(ok()) })
  })

  it('그사이 줄 상태가 바뀌어 409 가 오면 onDone 으로 서랍을 새로 부른다', async () => {
    server(() => json(409, { error: { code: 'CONFLICT', extra: { reason: 'not_forwardable' } } }))
    const onDone = vi.fn()
    open({ onDone })
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith())
  })

  it('서버가 호칭이 잘못됐다고 하면 직접 입력 칸에 오류를 붙인다', async () => {
    server(() => json(422, { error: { code: 'VALIDATION', extra: { field: 'label' } } }))
    open()
    await userEvent.click(screen.getByRole('button', { name: '직접 입력' }))
    await userEvent.type(screen.getByLabelText('받는 분 호칭'), '할머니')
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    expect(await screen.findByText('호칭을 1~20자로 입력해 주세요')).toBeTruthy()
  })

  it('세션이 끝났으면 onExpired 로 알린다', async () => {
    server(() => json(401, { error: { code: 'SESSION_EXPIRED' } }))
    const onExpired = vi.fn()
    open({ onExpired })
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
  })

  it('서버 오류는 일반 안내를 보이고 시트를 닫지 않는다. 처리 중에는 바깥을 눌러도 닫히지 않는다', async () => {
    let release: (r: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve })))
    const onClose = vi.fn()
    open({ onClose })
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    const backdrop = () => document.querySelector('.MuiBackdrop-root') as HTMLElement
    fireEvent.click(backdrop())
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { release(json(502, { error: { code: 'UPSTREAM_FAILED' } })) })
    expect(await screen.findByText(GENERIC)).toBeTruthy()
    fireEvent.click(backdrop())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('링크를 만든 뒤에는 어떻게 닫든 서랍을 새로 부른다 (줄 상태가 바뀌었다)', async () => {
    server()
    share(async () => { throw new DOMException('cancel', 'AbortError') })
    const onDone = vi.fn()
    const onClose = vi.fn()
    open({ onDone, onClose })
    await userEvent.click(screen.getByRole('button', { name: '직접 전달' }))
    await screen.findByRole('button', { name: '공유 창 다시 열기' })
    fireEvent.click(document.querySelector('.MuiBackdrop-root') as HTMLElement)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('시트를 닫았다 새 줄로 다시 열면 고른 호칭과 단계가 처음으로 돌아간다', async () => {
    const props = { onClose: noop, onDone: noop, onExpired: noop }
    const { rerender } = render(<ForwardSheet line={line} {...props} />)
    await userEvent.click(screen.getByRole('button', { name: '직접 입력' }))
    rerender(<ForwardSheet line={null} {...props} />)
    rerender(<ForwardSheet line={{ ...line }} {...props} />)
    expect(screen.queryByLabelText('받는 분 호칭')).toBeNull()
    expect(screen.getByRole('button', { name: '직접 입력' }).getAttribute('aria-pressed')).toBe('false')
  })
})
