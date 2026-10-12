import { assertEquals } from '@std/assert'
import {
  CENTER_NONE, EMPTY_APPLICATION, EMPTY_PURCHASE_FILTER, EMPTY_PURCHASE_INPUT, ORDER_CLAIM, ORDER_NONE, ORDER_REVIEW, PURCHASE_TYPES,
  SESSION_STATUSES, TYPE_UNCLASSIFIED, assignableSessionIds, clientLabel, countByStatus, filterPurchases, mainSession, purchaseTypeLabel, sessionProgress, testNames,
  validatePurchaseInput, type NaverSummary, type PurchaseRow, type SessionStatus,
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

const row = (id: string, status: SessionStatus, opts: Partial<{ center: string; client: string; guardian: string; test: string; type: PurchaseRow['purchase_type']; naver: NaverSummary }> = {}): PurchaseRow => ({
  id, purchase_type: opts.type === undefined ? 'test_main' : opts.type, product_name: null, paid_at: null, source: 'manual', created_at: '2026-10-12T00:00:00Z',
  naver_product_orders: opts.naver ?? null,
  naver_orderers: null,
  applications: opts.client || opts.guardian || opts.test
    ? { client_name: opts.client ?? null, guardian_name: opts.guardian ?? null, test_name: opts.test ?? null, submitted_at: null, residence: null, preferred_method: null, preferred_schedule: null }
    : null,
  sessions: [{ id: `${id}-s`, seq: 1, status, center_id: opts.center ?? null, scheduled_at: null }],
})

const naver = (id: string, status: string, claim: string | null = null, review = false): NaverSummary =>
  ({ naver_product_order_id: id, product_order_status: status, claim_status: claim, option_name: null, needs_review: review })

const rows = [
  row('a', 'unassigned', { client: '김예시', test: 'K-CBCL', naver: naver('2026101200000001', 'PAYED') }),
  row('b', 'requested', { client: '이샘플', center: 'c1', test: 'K-CBCL', type: 'group_buy', naver: naver('2026101200000002', 'PAYED', 'CANCEL_REQUEST') }),
  row('c', 'completed', { guardian: '박보호', center: 'c2', test: '기질검사', naver: naver('2026101200000003', 'CANCELED', 'CANCEL_DONE', true) }),
  row('d', 'cancelled', { type: null }),
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
  assertEquals(ids({ q: '00000002' }), ['b'])
  assertEquals(ids({ type: TYPE_UNCLASSIFIED }), ['d'])
})

Deno.test('주문 상태 거르기: 상태, 취소·반품 진행 중, 확인 필요, 네이버 주문 아님', () => {
  const ids = (order: string) => filterPurchases(rows, { ...EMPTY_PURCHASE_FILTER, order }).map((r) => r.id)
  assertEquals(ids('PAYED'), ['a', 'b'])
  assertEquals(ids(ORDER_CLAIM), ['b'])
  assertEquals(ids(ORDER_REVIEW), ['c'])
  assertEquals(ids(ORDER_NONE), ['d'])
  assertEquals(purchaseTypeLabel(null), '미분류')
})

Deno.test('목록 표시 도우미', () => {
  assertEquals(clientLabel(rows[2]), '박보호')
  assertEquals(clientLabel(rows[3]), '-')
  assertEquals(clientLabel({ applications: null, naver_orderers: { name_masked: '하*호', tel_masked: null } }), '하*호')
  // 한국어 정렬: 한글이 영문보다 앞
  assertEquals(testNames(rows), ['기질검사', 'K-CBCL'])
  // 끝나지 않은 첫 회차 → 없으면 마지막 완료 회차 → 없으면 첫 회차
  const ss = (...st: SessionStatus[]) => ({ sessions: st.map((status, i) => ({ id: `x${i + 1}`, seq: i + 1, status, center_id: null, scheduled_at: null })) })
  assertEquals(mainSession(ss('completed', 'unassigned'))?.id, 'x2')
  assertEquals(mainSession(ss('completed', 'completed', 'cancelled'))?.id, 'x2')
  assertEquals(mainSession(ss('cancelled', 'cancelled'))?.id, 'x1')
  assertEquals(sessionProgress(ss('completed', 'requested', 'cancelled')), { total: 2, completed: 1 })
  const multi = [{ id: 'p1', ...ss('requested', 'unassigned', 'confirmed') }, { id: 'p2', ...ss('unable') }, { id: 'p3', ...ss('unassigned') }]
  assertEquals(assignableSessionIds(multi, new Set(['p1', 'p2'])), ['x1', 'x2', 'x1'])
})

Deno.test('등록 입력 검사', () => {
  assertEquals(validatePurchaseInput(EMPTY_PURCHASE_INPUT), { client_name: 'purchase.error.nameRequired' })
  assertEquals(validatePurchaseInput({ ...EMPTY_PURCHASE_INPUT, with_application: false }), {})
  const app = { ...EMPTY_APPLICATION, guardian_name: '박보호', reason: '가'.repeat(2001) }
  assertEquals(validatePurchaseInput({ ...EMPTY_PURCHASE_INPUT, application: app }), { application: 'purchase.error.tooLong' })
  const bad = (naver_product_order_id: string) => validatePurchaseInput({ ...EMPTY_PURCHASE_INPUT, with_application: false, naver_product_order_id })
  assertEquals(bad('1'.repeat(41)), { naver_product_order_id: 'purchase.error.orderNoFormat' })
  assertEquals(bad('DEMO-1'), { naver_product_order_id: 'purchase.error.orderNoFormat' })
  assertEquals(bad(' 2026101200000001 '), {})
})
