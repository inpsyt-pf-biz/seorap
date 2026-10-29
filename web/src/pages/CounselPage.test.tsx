import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoxResponse, CounselFormResponse } from '@core/apiTypes.ts'
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
      { id: 'name', type: 'short', label: '성함', required: true },
      { id: 'when', type: 'availability', label: '상담 가능한 시간대', required: true, availability: DEFAULT_AVAILABILITY },
    ],
  },
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
const fill = async () => {
  await userEvent.click(await screen.findByLabelText(t('form.agree')))
  await userEvent.type(screen.getByLabelText('성함'), '홍길동')
  await userEvent.click(screen.getByRole('button', { name: '평일 저녁 상담 가능' }))
}

describe('상담 신청서 화면', () => {
  it('필수가 비면 서버에 보내지 않고 문항 아래에 표시한다', async () => {
    const calls = stubApi({ 'counsel/form': () => json(200, FORM()) })
    open()
    await userEvent.click(await screen.findByRole('button', { name: t('counsel.submit') }))
    expect(screen.getAllByText(t('form.error.required')).length).toBe(3)
    expect(screen.getByText(t('counsel.fix'))).toBeTruthy()
    expect(calls.map((c) => c.path)).toEqual(['counsel/form'])
  })

  it('다 채워 내면 템플릿·판·답을 보내고 완료 화면', async () => {
    const calls = stubApi({ 'counsel/form': () => json(200, FORM()), 'counsel/submit': () => json(200, { submitted: true }) })
    open()
    await fill()
    await userEvent.click(screen.getByRole('button', { name: t('counsel.submit') }))
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
    await userEvent.click(screen.getByRole('button', { name: t('counsel.submit') }))
    expect(await screen.findByText(t('counsel.changed'))).toBeTruthy()
    expect(screen.getByText('바뀐 안내')).toBeTruthy()
    expect((screen.getByLabelText('성함') as HTMLInputElement).value).toBe('홍길동')
  })

  it('인증한 지 오래됐으면 다시 인증 안내', async () => {
    stubApi({ 'counsel/form': () => json(401, { error: { code: 'REAUTH_REQUIRED', extra: { reason: 'counsel_fresh_auth' } } }) })
    open()
    expect(await screen.findByText(t('counsel.reauth'))).toBeTruthy()
  })
})

describe('서랍 상담 카드', () => {
  const boxWith = (submitted: boolean): BoxResponse => ({
    ownerName: '김철수', notStartedCount: 0, noticeBanner: null, pinSet: true,
    counsel: [{ orderId: ORDER, productName: 'GOLDEN 커플 상담 패키지', submitted, submittedAt: submitted ? '2026-10-29T00:00:00Z' : null }],
    groups: [{
      orderId: ORDER, purchasedAt: '2026-10-22T00:00:00Z', productName: 'GOLDEN 커플 상담 패키지', lineCount: 1, done: false,
      lines: [{
        voucherId: 'v1', testItemId: 'T', testName: 'GOLDEN 성격유형검사', unitNo: 1, unitsOfTest: 1, firstLaunchedAt: null, forwardTo: null,
        status: { label: '신청서 제출 후 열려요', tone: 'info', actions: submitted ? ['launch', 'forward'] : ['counsel_form'] },
      }],
    }],
  })

  it('내기 전: 카드의 [신청서 쓰기]와 잠긴 줄의 [신청서 쓰기]가 신청서로 간다', async () => {
    stubApi({ box: () => json(200, boxWith(false)), 'counsel/form': () => json(200, FORM()) })
    open('/box')
    expect(await screen.findByText(t('counsel.card.title'))).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: t('counsel.card.button') })
    expect(buttons.length).toBe(2)
    await userEvent.click(buttons[1])
    expect(await screen.findByRole('button', { name: t('counsel.submit') })).toBeTruthy()
  })

  it('낸 뒤: 제출 완료 카드, 버튼 없음', async () => {
    stubApi({ box: () => json(200, boxWith(true)) })
    open('/box')
    expect(await screen.findByText(t('counsel.card.doneTitle'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('counsel.card.button') })).toBeNull()
  })
})
