import { assertEquals } from '@std/assert'
import {
  CENTER_NONE, EMPTY_APPLICATION, EMPTY_PURCHASE_FILTER, EMPTY_PURCHASE_INPUT, PURCHASE_TYPES, SESSION_STATUSES,
  clientLabel, countByStatus, filterPurchases, mainSession, testNames, validatePurchaseInput,
  type PurchaseRow, type SessionStatus,
} from './purchases.ts'

const sql = Deno.readTextFileSync(new URL('../supabase/migrations/20261012000003_purchases_sessions.sql', import.meta.url))
function checkList(column: string): string[] {
  const m = new RegExp(`${column} [^\\n]*check \\(${column} in \\(([^)]*)`, 's').exec(sql)
    ?? new RegExp(`check \\(${column} in \\(([^)]*)`, 's').exec(sql)
  if (!m) throw new Error(`CHECK for ${column} not found`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

Deno.test('구매 구분·상담 상태가 DB CHECK 와 같다', () => {
  assertEquals(checkList('purchase_type'), [...PURCHASE_TYPES])
  assertEquals(checkList('status'), [...SESSION_STATUSES])
})

const row = (id: string, status: SessionStatus, opts: Partial<{ center: string; client: string; guardian: string; test: string; type: PurchaseRow['purchase_type'] }> = {}): PurchaseRow => ({
  id, purchase_type: opts.type ?? 'test_main', order_no: null, product_name: null, source: 'manual', created_at: '2026-10-12T00:00:00Z',
  applications: opts.client || opts.guardian || opts.test
    ? { client_name: opts.client ?? null, guardian_name: opts.guardian ?? null, test_name: opts.test ?? null, submitted_at: null, residence: null, preferred_method: null, preferred_schedule: null }
    : null,
  sessions: [{ id: `${id}-s`, seq: 1, status, center_id: opts.center ?? null, scheduled_at: null }],
})

const rows = [
  row('a', 'unassigned', { client: '김예시', test: 'K-CBCL' }),
  row('b', 'requested', { client: '이샘플', center: 'c1', test: 'K-CBCL', type: 'group_buy' }),
  row('c', 'completed', { guardian: '박보호', center: 'c2', test: '기질검사' }),
  row('d', 'cancelled'),
]

Deno.test('상태별 건수', () => {
  const c = countByStatus(rows)
  assertEquals([c.all, c.unassigned, c.requested, c.completed, c.cancelled, c.confirmed], [4, 1, 1, 1, 1, 0])
})

Deno.test('거르기: 이름(내담자·보호자), 구분, 센터(미배정 포함), 검사, 상태', () => {
  const ids = (f: Partial<typeof EMPTY_PURCHASE_FILTER>) => filterPurchases(rows, { ...EMPTY_PURCHASE_FILTER, ...f }).map((r) => r.id)
  assertEquals(ids({}), ['a', 'b', 'c', 'd'])
  assertEquals(ids({ q: '보호' }), ['c'])
  assertEquals(ids({ type: 'group_buy' }), ['b'])
  assertEquals(ids({ center: CENTER_NONE }), ['a', 'd'])
  assertEquals(ids({ center: 'c2' }), ['c'])
  assertEquals(ids({ test: 'K-CBCL', status: 'requested' }), ['b'])
})

Deno.test('목록 표시 도우미', () => {
  assertEquals(clientLabel(rows[2]), '박보호')
  assertEquals(clientLabel(rows[3]), '-')
  // 한국어 정렬: 한글이 영문보다 앞
  assertEquals(testNames(rows), ['기질검사', 'K-CBCL'])
  assertEquals(mainSession({ sessions: [{ id: 'x2', seq: 2, status: 'unassigned', center_id: null, scheduled_at: null }, { id: 'x1', seq: 1, status: 'completed', center_id: 'c', scheduled_at: null }] })?.id, 'x1')
})

Deno.test('등록 입력 검사', () => {
  assertEquals(validatePurchaseInput(EMPTY_PURCHASE_INPUT), { client_name: 'purchase.error.nameRequired' })
  assertEquals(validatePurchaseInput({ ...EMPTY_PURCHASE_INPUT, with_application: false }), {})
  const app = { ...EMPTY_APPLICATION, guardian_name: '박보호', reason: '가'.repeat(2001) }
  assertEquals(validatePurchaseInput({ ...EMPTY_PURCHASE_INPUT, application: app }), { application: 'purchase.error.tooLong' })
  assertEquals(validatePurchaseInput({ ...EMPTY_PURCHASE_INPUT, with_application: false, order_no: '1'.repeat(41) }), { order_no: 'purchase.error.orderNoLength' })
})
