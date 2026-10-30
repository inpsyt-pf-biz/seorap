import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { PurchaseRow } from '@counsel-core/purchases.ts'
import { CommandsProvider, usePageCommands } from '../shell/commands'
import CommandPalette from './CommandPalette'

const purchase: PurchaseRow = {
  id: 'p1', purchase_type: 'counsel_main', product_name: 'STS 커플 기질검사 + 해석상담', paid_at: '2026-10-19T12:14:00Z', source: 'naver', created_at: '2026-10-19T12:14:00Z',
  applications: { client_name: '김예시', client_phone: '010-4821-3307', guardian_name: null, guardian_phone: null, test_name: null, submitted_at: null, residence: null, preferred_method: null, preferred_schedule: null },
  naver_product_orders: { naver_product_order_id: '2026101921140381', product_order_status: 'PAYED', claim_status: null, option_name: null, needs_review: false },
  naver_orderers: null, purchase_tests: [], sessions: [],
}

vi.mock('../lib/api', () => ({
  listPurchases: vi.fn(async () => [purchase]),
  listCenters: vi.fn(async () => [{ id: 'c1', name: '마음숲 상담센터' }]),
  listFormTemplates: vi.fn(async () => [{ id: 'f1', name: '[협찬] STS 커플상담 신청서' }]),
}))
vi.mock('../shell/session', () => ({ useSession: () => ({ state: { status: 'ready' } }), hasCap: () => true }))

afterEach(cleanup)

function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}
function PageWithCommand({ onRun }: { onRun: () => void }) {
  usePageCommands(() => [{ id: 'x', label: '기간: 최근 7일', run: onRun }], [])
  return null
}

function setup(onRun = vi.fn()) {
  const onClose = vi.fn()
  render(
    <MemoryRouter initialEntries={['/admin/counsel/purchases']}>
      <CommandsProvider>
        <Routes><Route path="*" element={<><PageWithCommand onRun={onRun} /><Where /></>} /></Routes>
        <CommandPalette open onClose={onClose} />
      </CommandsProvider>
    </MemoryRouter>,
  )
  return { onClose, onRun, input: screen.getByRole('combobox') }
}

describe('CommandPalette', () => {
  it('비어 있으면 이 화면 명령·보기·이동, 연락처 숫자로 구매 건을 찾아 Enter 로 연다', async () => {
    const { input, onClose } = setup()
    expect(screen.getByText('기간: 최근 7일')).toBeTruthy()
    expect(screen.getByText('할 일 보기')).toBeTruthy()
    fireEvent.change(input, { target: { value: '3307' } })
    expect(await screen.findByText('김예시 · 010-4821-3307')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onClose).toHaveBeenCalled()
    expect(screen.getByTestId('where').textContent).toBe('/admin/counsel/purchases/p1')
  })

  it('방향키로 고르고 실행, 화면 이름과 센터도 찾는다', async () => {
    const { input, onRun } = setup()
    fireEvent.change(input, { target: { value: '마음숲' } })
    expect(await screen.findByText('마음숲 상담센터')).toBeTruthy()
    fireEvent.change(input, { target: { value: '기간' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRun).toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '할 일' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toBe('/admin/counsel/purchases?stage=__todo__')
  })
})
