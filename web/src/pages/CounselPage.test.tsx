import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoxResponse, CounselFormResponse } from '@core/apiTypes.ts'
import type { Booking } from '@core/counselBooking.ts'
import { t } from '@core/copy.ko.ts'
import { DEFAULT_AVAILABILITY } from '@core/counselForm.ts'
import BoxPage from './BoxPage'
import CounselPage from './CounselPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const ORDER = '11111111-1111-4111-8111-111111111111'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const FORM = (version = 1, intro = '안내'): CounselFormResponse => ({
  orderId: ORDER, productName: 'GOLDEN 커플 상담 패키지', templateId: 'tpl', version,
  definition: {
    intro,
    fields: [
      { id: 'c1', type: 'consent', label: '개인정보 제3자 제공 동의', required: true, consentKind: 'third_party' },
      { id: 'pv', type: 'providers', label: '제공받는 업체 정보' },
      { id: 'name', type: 'short', label: '성함', required: true },
      { id: 'when', type: 'availability', label: '상담 가능한 시간대', required: true, availability: DEFAULT_AVAILABILITY },
    ],
  },
  providers: [
    { name: '마음숲 상담센터', phone: '02-123-4567', address: '서울시 마포구 1' },
    { name: '바다빛 심리연구소', phone: null, address: '부산시 해운대구 2' },
  ],
})

function stubApi(routes: Record<string, (body: any) => Response>) {
  const calls: { path: string; body: any }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^\/api\//, '')
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ path, body })
    const route = routes[path]
    if (!route) throw new Error(`unexpected call: ${path}`)
    return route(body)
  }))
  return calls
}
const open = (path = `/box/counsel/${ORDER}`) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/box" element={<BoxPage />} />
      <Route path="/box/counsel/:orderId" element={<CounselPage />} />
    </Routes>
  </MemoryRouter>,
)
// 단계형 화면 (11-10): 동의 → 성함 → 상담 방식 → 시간 칸 → 시작일 → 연락 시간 → 확인
const fill = async () => {
  await userEvent.click(await screen.findByRole('button', { name: t('steps.agreeAll') }))
  await userEvent.type(await screen.findByLabelText('성함'), '홍길동{Enter}')
  await userEvent.click(await screen.findByRole('button', { name: t('steps.skip') }))
  await userEvent.click(await screen.findByRole('button', { name: '평일 저녁 상담 가능' }))
  await userEvent.click(screen.getByRole('button', { name: t('steps.next') }))
  await userEvent.click(await screen.findByRole('button', { name: t('steps.skip') }))
  await userEvent.click(await screen.findByRole('button', { name: t('steps.skip') }))
  await screen.findByText(t('steps.review.title'))
}

describe('상담 신청서 화면', () => {
  afterEach(() => sessionStorage.clear())

  it('필수가 비면 다음으로 넘어가지 않고 서버에도 보내지 않는다', async () => {
    const calls = stubApi({ 'counsel/form': () => json(200, FORM()) })
    open()
    await userEvent.click(await screen.findByRole('button', { name: t('steps.agreeAll') }))
    await userEvent.click(await screen.findByRole('button', { name: t('steps.next') }))
    expect(screen.getByText(t('form.error.required'))).toBeTruthy()
    expect(screen.getByLabelText('성함')).toBeTruthy()
    expect(calls.map((c) => c.path)).toEqual(['counsel/form'])
  })

  it('다 채워 내면 템플릿·판·답을 보내고 완료 화면', async () => {
    const calls = stubApi({ 'counsel/form': () => json(200, FORM()), 'counsel/submit': () => json(200, { submitted: true }) })
    open()
    await fill()
    await userEvent.click(screen.getByRole('button', { name: t('steps.submit') }))
    expect(await screen.findByText(t('counsel.done.title'))).toBeTruthy()
    const sent = calls.find((c) => c.path === 'counsel/submit')!.body
    expect([sent.orderId, sent.templateId, sent.version]).toEqual([ORDER, 'tpl', 1])
    expect(sent.answers).toEqual({ c1: true, name: '홍길동', when: { cells: ['weekday|evening'] } })
  })

  it('그사이 새 판이 게시됐으면 다시 불러오고 쓴 답은 남긴다', async () => {
    let n = 0
    stubApi({
      'counsel/form': () => json(200, n++ === 0 ? FORM(1) : FORM(2, '바뀐 안내')),
      'counsel/submit': () => json(409, { error: { code: 'CONFLICT', extra: { reason: 'form_changed' } } }),
    })
    open()
    await fill()
    await userEvent.click(screen.getByRole('button', { name: t('steps.submit') }))
    expect(await screen.findByText(t('counsel.changed'))).toBeTruthy()
    expect(screen.getByText('홍길동')).toBeTruthy()
  })

  it('고르는 질문은 누르면 넘어가고, 넘어가는 사이 한 번 더 눌러도 다음 질문에 답이 들어가지 않는다', async () => {
    stubApi({ 'counsel/form': () => json(200, FORM()) })
    open()
    await userEvent.click(await screen.findByRole('button', { name: t('steps.agreeAll') }))
    await userEvent.type(await screen.findByLabelText('성함'), '홍길동{Enter}')
    const pick = await screen.findByRole('button', { name: '화상' })
    await userEvent.click(pick)
    await userEvent.click(pick)
    await screen.findByRole('button', { name: '평일 저녁 상담 가능' })
    expect(screen.getAllByRole('button', { name: /상담 가능$/ }).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('쓰던 답은 화면을 다시 열어도 남아 있고, 내면 지운다', async () => {
    stubApi({ 'counsel/form': () => json(200, FORM()), 'counsel/submit': () => json(200, { submitted: true }) })
    open()
    await userEvent.click(await screen.findByRole('button', { name: t('steps.agreeAll') }))
    await userEvent.type(await screen.findByLabelText('성함'), '홍길동')
    cleanup()
    open()
    await userEvent.click(await screen.findByRole('button', { name: t('steps.agreeAll') }))
    expect(((await screen.findByLabelText('성함')) as HTMLInputElement).value).toBe('홍길동')
  })

  it('제공받는 업체 정보는 "N곳"으로 접혀 있고, 누르면 업체명·전화·주소가 보인다', async () => {
    stubApi({ 'counsel/form': () => json(200, FORM()) })
    open()
    const head = await screen.findByRole('button', { name: /제공받는 업체 정보/ })
    expect(head.textContent).toContain(t('form.providers.count', { n: 2 }))
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('마음숲 상담센터')).toBeNull()
    await userEvent.click(head)
    expect(head.getAttribute('aria-expanded')).toBe('true')
    for (const text of ['마음숲 상담센터', '02-123-4567', '서울시 마포구 1', '바다빛 심리연구소', '부산시 해운대구 2']) expect(screen.getByText(text)).toBeTruthy()
  })

  it('인증한 지 오래됐으면 다시 인증 안내', async () => {
    stubApi({ 'counsel/form': () => json(401, { error: { code: 'REAUTH_REQUIRED', extra: { reason: 'counsel_fresh_auth' } } }) })
    open()
    expect(await screen.findByText(t('counsel.reauth'))).toBeTruthy()
  })
})

describe('서랍 상담 카드', () => {
  const WAITING: Booking = { state: 'waiting', scheduledAt: null, centerName: null }
  const BOOKED: Booking = { state: 'confirmed', scheduledAt: '2026-11-26T05:00:00Z', centerName: '마음숲 상담센터' }
  // 검사는 예약이 확정된 뒤에 열린다 (testsOpen). 제출 전에는 booking 이 없다
  const boxWith = (submitted: boolean, booking: Booking | null = submitted ? WAITING : null, open = booking?.state !== 'waiting' && booking !== null): BoxResponse => ({
    ownerName: '김철수', notStartedCount: 0, noticeBanner: null, pinSet: true,
    counsel: [{ orderId: ORDER, productName: 'GOLDEN 커플 상담 패키지', submitted, submittedAt: submitted ? '2026-10-29T00:00:00Z' : null, booking, testsOpen: open }],
    groups: [{
      orderId: ORDER, purchasedAt: '2026-10-22T00:00:00Z', productName: 'GOLDEN 커플 상담 패키지', lineCount: 1, done: false,
      lines: [{
        voucherId: 'v1', testItemId: 'T', testName: 'GOLDEN 성격유형검사', unitNo: 1, unitsOfTest: 1, firstLaunchedAt: null, forwardTo: null, recipientLabels: [],
        status: open
          ? { label: '실시 전', tone: 'neutral', actions: ['launch', 'forward'] }
          : { label: t('line.counselLocked'), tone: 'info', actions: [], disabled: ['launch', 'forward'] },
      }],
    }],
  })

  it('제출 전: 신청서로 가는 길은 카드의 [상담 신청서 작성] 하나, 검사 줄의 실시하기·전달하기는 꺼져 있다', async () => {
    stubApi({ box: () => json(200, boxWith(false)), 'counsel/form': () => json(200, FORM()) })
    open('/box')
    expect(await screen.findByText(t('counsel.card.title'))).toBeTruthy()
    expect((screen.getByRole('button', { name: t('action.launch') }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: t('action.forward') }) as HTMLButtonElement).disabled).toBe(true)
    const buttons = screen.getAllByRole('button', { name: t('counsel.card.button') })
    expect(buttons.length).toBe(1)
    await userEvent.click(buttons[0])
    expect(await screen.findByRole('button', { name: t('steps.agreeAll') })).toBeTruthy()
  })

  it('낸 뒤(예약 확정 전): 제출 완료 카드에 연락 대기 문구, 버튼 없음, 검사는 아직 잠겨 있다', async () => {
    stubApi({ box: () => json(200, boxWith(true)) })
    open('/box')
    expect(await screen.findByText(t('counsel.card.doneTitle'))).toBeTruthy()
    expect(screen.getByText(t('counsel.card.doneBody'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('counsel.card.button') })).toBeNull()
    expect((screen.getByRole('button', { name: t('action.launch') }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('예약 확정 뒤: 예약 일시·센터·검사 완료 권장일(상담 3일 전)을 보이고 검사가 열린다', async () => {
    stubApi({ box: () => json(200, boxWith(true, BOOKED)) })
    open('/box')
    expect(await screen.findByText(t('counsel.card.bookedTitle'))).toBeTruthy()
    expect(screen.getByText('11월 26일(목) 오후 2시')).toBeTruthy()
    expect(screen.getByText('마음숲 상담센터')).toBeTruthy()
    expect(screen.getByText(t('counsel.card.bookedDue', { due: '11월 23일(월)' }))).toBeTruthy()
    expect((screen.getByRole('button', { name: t('action.launch') }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('상담을 마친 뒤: 상담을 마쳤어요', async () => {
    stubApi({ box: () => json(200, boxWith(true, { ...BOOKED, state: 'completed' })) })
    open('/box')
    expect(await screen.findByText(t('counsel.card.completedTitle'))).toBeTruthy()
    expect(screen.queryByText(t('counsel.card.bookedDue', { due: '11월 23일(월)' }))).toBeNull()
  })

  it('검사가 열린 뒤 예약이 취소되면: 검사는 열린 채, 카드는 다시 연락한다는 문구', async () => {
    stubApi({ box: () => json(200, boxWith(true, WAITING, true)) })
    open('/box')
    expect(await screen.findByText(t('counsel.card.rebookBody'))).toBeTruthy()
    expect(screen.queryByText(t('counsel.card.doneBody'))).toBeNull()
  })
})
