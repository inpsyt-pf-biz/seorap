import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PurchaseRow, SessionStatus } from '@counsel-core/purchases.ts'
import ProgressCell from './ProgressCell'

afterEach(cleanup)

const app = { client_name: '김예시', client_phone: null, guardian_name: null, guardian_phone: null, test_name: null, submitted_at: '2026-10-05T01:00:00Z', residence: null, preferred_method: null, preferred_schedule: null }
const row = (status: SessionStatus | null, o: { app?: boolean; center?: string; at?: string } = {}): Pick<PurchaseRow, 'applications' | 'sessions' | 'created_at'> => ({
  created_at: '2026-10-04T00:00:00Z',
  applications: o.app ? app : null,
  sessions: status ? [{ id: 's', seq: 1, status, center_id: o.center ?? null, scheduled_at: o.at ?? null }] : [],
})
const show = (r: ReturnType<typeof row>) => render(<ProgressCell row={r} centerName={(id) => (id === 'c1' ? '마음숲 상담센터' : undefined)} />)

describe('ProgressCell', () => {
  it('네 단계와 지금 단계·센터를 한 칸에', () => {
    show(row('unassigned'))
    expect(screen.getByText('신청서 미작성')).toBeTruthy()
    cleanup()
    show(row('unassigned', { app: true }))
    expect(screen.getByText('센터 미배정')).toBeTruthy()
    expect(screen.getByText('신청서 10-05')).toBeTruthy()
    cleanup()
    show(row('requested', { app: true, center: 'c1' }))
    expect(screen.getByText(/예약 중 · 마음숲 상담센터/)).toBeTruthy()
    cleanup()
    show(row('confirmed', { app: true, center: 'c1', at: '2026-11-02T05:00:00Z' }))
    expect(screen.getByText('예약 완료 · 11-02 14:00')).toBeTruthy()
    expect(screen.getByText('마음숲 상담센터')).toBeTruthy()
  })

  it('불가·취소는 멈춘 단계로, 상담 회차가 없으면 검사만', () => {
    show(row('unable', { app: true, center: 'c1' }))
    expect(screen.getByText('상담 불가 · 다시 배정')).toBeTruthy()
    expect(screen.getByLabelText('진행: 상담 불가 · 다시 배정')).toBeTruthy()
    cleanup()
    show(row('cancelled', { app: true }))
    expect(screen.getByText('취소')).toBeTruthy()
    expect(screen.getByText('예약 중 · 신청서 10-05')).toBeTruthy()
    cleanup()
    show(row(null))
    expect(screen.getByText('검사만')).toBeTruthy()
  })
})
