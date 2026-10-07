import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoxLine } from '@core/apiTypes.ts'
import ForwardSheet from './ForwardSheet'

const line: BoxLine = {
  voucherId: 'v1', testItemId: 'T', testName: 'STS 성인 기질검사', unitNo: 2, unitsOfTest: 2, firstLaunchedAt: null, forwardTo: null,
  status: { label: '실시 전', tone: 'neutral', actions: ['launch', 'forward'] },
}
// vitest 에 globals 가 없어 RTL 의 자동 정리가 꺼져 있다. 테스트마다 직접 비우고, 가짜 fetch·클립보드도 되돌린다.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'clipboard')
})

const noop = () => {}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

async function fillAndConfirm() {
  await userEvent.type(screen.getByLabelText('이름 또는 호칭'), '홍길동')
  await userEvent.type(screen.getByLabelText('휴대폰 번호'), '01012345678')
  await userEvent.click(screen.getByRole('button', { name: '다음' }))
}

describe('ForwardSheet', () => {
  it('잘못된 번호면 다음으로 넘어가지 않고 서버를 부르지 않는다', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<ForwardSheet line={line} onClose={noop} onDone={noop} onExpired={noop} />)
    await userEvent.type(screen.getByLabelText('이름 또는 호칭'), '홍길동')
    await userEvent.type(screen.getByLabelText('휴대폰 번호'), '02-123-4567')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('휴대폰 번호를 확인해 주세요 (예: 010-1234-5678)')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('번호는 입력 중 자동 하이픈, 확인 화면에 크게 다시 보인다', async () => {
    render(<ForwardSheet line={line} onClose={noop} onDone={noop} onExpired={noop} />)
    await userEvent.type(screen.getByLabelText('이름 또는 호칭'), '홍길동')
    await userEvent.type(screen.getByLabelText('휴대폰 번호'), '01012345678')
    expect((screen.getByLabelText('휴대폰 번호') as HTMLInputElement).value).toBe('010-1234-5678')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('이 번호가 맞나요?')).toBeTruthy()
    expect(screen.getByText('010-1234-5678')).toBeTruthy()
  })

  it('보내기를 두 번 눌러도 같은 요청 ID로 간다', async () => {
    const bodies: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body))
      return json(200, { forwardId: 'f1', created: true })
    }))
    render(<ForwardSheet line={line} onClose={noop} onDone={noop} onExpired={noop} />)
    await fillAndConfirm()
    const send = screen.getByRole('button', { name: '보내기' })
    await userEvent.click(send)
    await userEvent.click(send)
    const ids = bodies.map((b) => JSON.parse(b).clientRequestId)
    expect(new Set(ids).size).toBe(1)
  })

  it('보내기를 처리 중에 또 눌러도 서버 호출은 한 번이다', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    render(<ForwardSheet line={line} onClose={noop} onDone={noop} onExpired={noop} />)
    await fillAndConfirm()
    const send = screen.getByRole('button', { name: '보내기' })
    // 화면이 다시 그려지기 전에 두 번째 탭이 들어오는 연타를 한 번의 act 안에서 흉내 낸다
    act(() => { send.click(); send.click() })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('본인 번호면 확인을 거쳐, 같은 요청 ID 에 확인 표시를 붙여 다시 보낸다', async () => {
    const sent: { confirmSelf: boolean; clientRequestId: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      sent.push({ confirmSelf: body.confirmSelf, clientRequestId: body.clientRequestId })
      return body.confirmSelf
        ? json(200, { forwardId: 'f1', created: true })
        : json(409, { error: { code: 'CONFLICT', extra: { reason: 'self_number' } } })
    }))
    const onDone = vi.fn()
    render(<ForwardSheet line={line} onClose={noop} onDone={onDone} onExpired={noop} />)
    await fillAndConfirm()
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    await screen.findByText('본인 번호예요. 직접 실시하시겠어요?')
    expect(onDone).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '그래도 보내기' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(sent.map((s) => s.confirmSelf)).toEqual([false, true])
    expect(sent[0].clientRequestId).toBe(sent[1].clientRequestId)
  })

  it('한도에 걸리면 풀리는 시각을 안내하고 시트를 닫지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(429, {
      error: { code: 'LIMIT_EXCEEDED', extra: { reason: 'same_number_gap', retryAt: '2026-10-08T01:30:00.000Z' } },
    })))
    const onDone = vi.fn()
    render(<ForwardSheet line={line} onClose={noop} onDone={onDone} onExpired={noop} />)
    await fillAndConfirm()
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(await screen.findByText('같은 번호로는 2026-10-08 10:30부터 다시 보낼 수 있어요')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('모르는 한도 이유나 서버 오류는 일반 안내로 보인다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(429, { error: { code: 'LIMIT_EXCEEDED', extra: { reason: 'brand_new_rule' } } })))
    render(<ForwardSheet line={line} onClose={noop} onDone={noop} onExpired={noop} />)
    await fillAndConfirm()
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(await screen.findByText('잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요')).toBeTruthy()
  })

  it('세션이 끝났으면 onExpired 로 알린다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: { code: 'SESSION_EXPIRED' } })))
    const onExpired = vi.fn()
    render(<ForwardSheet line={line} onClose={noop} onDone={noop} onExpired={onExpired} />)
    await fillAndConfirm()
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1))
  })

  it('직접 공유는 처리 중에 또 눌러도 서버 호출은 한 번이다', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    render(<ForwardSheet line={line} onClose={noop} onDone={noop} onExpired={noop} />)
    await userEvent.click(screen.getByRole('button', { name: '더보기' }))
    const direct = screen.getByRole('button', { name: '번호 없이 링크 복사하기' })
    act(() => { direct.click(); direct.click() })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('직접 공유: 복사에 성공하면 안내를 보이고, 닫을 때 서랍을 새로 부른다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { url: 'https://x.test/a', text: '[인싸이트 서랍] 링크 https://x.test/a' })))
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const onDone = vi.fn()
    render(<ForwardSheet line={line} onClose={noop} onDone={onDone} onExpired={noop} />)
    await userEvent.click(screen.getByRole('button', { name: '더보기' }))
    await userEvent.click(screen.getByRole('button', { name: '번호 없이 링크 복사하기' }))
    expect(await screen.findByText('링크를 복사했어요. 원하는 곳에 붙여넣어 주세요')).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith('[인싸이트 서랍] 링크 https://x.test/a')
    expect(onDone).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('직접 공유: 복사가 막히면 문구를 화면에 남겨 직접 복사할 수 있게 한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { url: 'https://x.test/a', text: '[인싸이트 서랍] 링크 https://x.test/a' })))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('denied') }) }, configurable: true })
    const onDone = vi.fn()
    render(<ForwardSheet line={line} onClose={noop} onDone={onDone} onExpired={noop} />)
    await userEvent.click(screen.getByRole('button', { name: '더보기' }))
    await userEvent.click(screen.getByRole('button', { name: '번호 없이 링크 복사하기' }))
    expect(await screen.findByText('[인싸이트 서랍] 링크 https://x.test/a')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })
})
