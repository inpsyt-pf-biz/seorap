import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HistoryItem } from '@core/apiTypes.ts'
import HistoryPage from './HistoryPage'

// vitest 에 globals 가 없어 RTL 의 자동 정리가 꺼져 있다. 테스트마다 직접 비우고, 가짜 fetch 도 되돌린다.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const GENERIC = '잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요'
const EMPTY = '아직 전달한 검사가 없어요'

const base: HistoryItem = {
  id: 'h', at: '2026-10-08T03:00:00.000Z', action: 'forward', testName: 'STS 성인 기질검사', unitNo: 1,
  toName: '유관순', toPhone: '010-3333-5555', result: 'delivered_alimtalk', openedAt: null,
}

function open(items: unknown, status = 200) {
  const fetchMock = vi.fn(async () => json(status, items))
  vi.stubGlobal('fetch', fetchMock)
  render(
    <MemoryRouter initialEntries={['/box/history']}>
      <Routes>
        <Route path="/box/history" element={<HistoryPage />} />
        <Route path="/box" element={<div>서랍 화면</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return fetchMock
}

describe('HistoryPage', () => {
  it('전달·취소·전달 3건을 받은 순서(최신순) 그대로, 받는 분·결과·검사·시각을 나눠 보인다 (점·빗금 이음 없이)', async () => {
    const fetchMock = open({
      items: [
        { ...base, id: 'h3', openedAt: '2026-10-08T04:00:00.000Z' },
        { ...base, id: 'h2', at: '2026-10-08T02:00:00.000Z', action: 'cancel', toName: '이순신', toPhone: null, result: null },
        { ...base, id: 'h1', at: '2026-10-08T01:00:00.000Z', toName: '이순신', toPhone: '010-1111-2222', result: 'delivered_sms' },
      ] satisfies HistoryItem[],
    })
    const first = await screen.findByText('유관순 010-3333-5555')
    const cancel = screen.getByText('이순신님께 보낸 전달을 취소함')
    const last = screen.getByText('이순신 010-1111-2222')
    expect(first.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(cancel.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('알림톡 전달 완료')).toBeTruthy()
    expect(screen.getByText('문자로 전달 완료')).toBeTruthy()
    expect(screen.getByText('2026-10-08 12:00')).toBeTruthy()
    expect(screen.getByText('2026-10-08 11:00')).toBeTruthy()
    expect(screen.getAllByText('STS 성인 기질검사 1번째').length).toBeGreaterThan(0)
    expect(screen.getByText('받는 분이 열어 봄')).toBeTruthy()
    const list = screen.getByRole('list')
    expect(list.textContent).not.toMatch(/ · | \/ /)
    expect(screen.queryByText(EMPTY)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]).toEqual(['/api/history', expect.objectContaining({ method: 'GET' })])
  })

  it('직접 공유·다시 보내기(보내는 중)·전달 실패를 구분해 보인다', async () => {
    open({
      items: [
        { ...base, id: 'd', at: '2026-10-08T00:00:00.000Z', action: 'direct_share', toName: null, toPhone: null, result: null },
        { ...base, id: 'r', action: 'resend', unitNo: 2, result: null },
        { ...base, id: 'f', toName: '강감찬', toPhone: '010-4444-6666', result: 'failed' },
      ] satisfies HistoryItem[],
    })
    expect(await screen.findByText('링크 직접 공유')).toBeTruthy()
    expect(screen.getByText('받는 분 미확인')).toBeTruthy()
    expect(screen.getByText('보내는 중')).toBeTruthy()
    expect(screen.getByText('STS 성인 기질검사 2번째')).toBeTruthy()
    expect(screen.getByText('다시 보내기')).toBeTruthy()
    expect(screen.getByText('강감찬 010-4444-6666')).toBeTruthy()
    expect(screen.getByText('전달 실패')).toBeTruthy()
  })

  it('머리글은 내 검사 탭과 같다: 설정이 있고, 서랍에서 넘어오면 "○○님의 서랍" 제목도 보인다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { items: [] })))
    render(
      <MemoryRouter initialEntries={[{ pathname: '/box/history', state: { ownerName: '김서랍' } }]}>
        <Routes><Route path="/box/history" element={<HistoryPage />} /></Routes>
      </MemoryRouter>,
    )
    await screen.findByText(EMPTY)
    expect(screen.getByRole('button', { name: '설정' })).toBeTruthy()
    expect(screen.getByText('김서랍님의 서랍')).toBeTruthy()
  })

  it('이력이 없으면 안내 문구를 보인다', async () => {
    open({ items: [] })
    expect(await screen.findByText(EMPTY)).toBeTruthy()
  })

  it('세션이 끝났으면(401) 다시 인증 화면으로 바꾼다', async () => {
    open({ error: { code: 'SESSION_EXPIRED' } }, 401)
    expect(await screen.findByText('다시 인증해 주세요. 받은 알림톡의 링크를 다시 눌러 주세요')).toBeTruthy()
  })

  it('세션 코드가 아닌 401(게이트웨이 등)은 다시 인증 대신 오류 안내를 보인다', async () => {
    open({ msg: 'Invalid JWT' }, 401)
    expect(await screen.findByText(GENERIC)).toBeTruthy()
    expect(screen.queryByText('다시 인증해 주세요. 받은 알림톡의 링크를 다시 눌러 주세요')).toBeNull()
  })

  it('불러오기가 실패하면 "이력 없음" 대신 오류 안내를 보인다', async () => {
    open({ error: { code: 'UPSTREAM_FAILED' } }, 502)
    expect(await screen.findByText(GENERIC)).toBeTruthy()
    expect(screen.queryByText(EMPTY)).toBeNull()
  })

  it('[전달 이력] 탭이 선택돼 있고, [내 검사] 탭을 누르면 서랍으로 간다', async () => {
    open({ items: [] })
    await screen.findByText(EMPTY)
    expect(screen.getByRole('tab', { name: '전달 이력' }).getAttribute('aria-selected')).toBe('true')
    await userEvent.click(screen.getByRole('tab', { name: '내 검사' }))
    expect(await screen.findByText('서랍 화면')).toBeTruthy()
  })
})

describe('HistoryPage 리뷰 반영', () => {
  it('링크 직접 공유 줄에도 어떤 검사를 공유했는지 보인다', async () => {
    open({ items: [{ ...base, id: 'd', action: 'direct_share', toName: null, toPhone: null, result: null }] satisfies HistoryItem[] })
    expect(await screen.findByText('링크 직접 공유')).toBeTruthy()
    expect(screen.getByText('STS 성인 기질검사 1번째')).toBeTruthy()
  })
})
