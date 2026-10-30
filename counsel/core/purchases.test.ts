import { assertEquals } from '@std/assert'
import {
  CENTER_NONE, EMPTY_APPLICATION, EMPTY_PURCHASE_FILTER, EMPTY_PURCHASE_INPUT, ORDER_CLAIM, ORDER_NONE, ORDER_REVIEW, PURCHASE_TYPES,
  SESSION_STATUSES, STAGE_TEST_ONLY, TYPE_UNCLASSIFIED, assignableSessionIds, clientLabel, contactLabel, countByStage, filterPurchases, mainSession, periodRange,
  purchaseStage, purchaseTypeLabel, sessionProgress, testNames,
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

const row = (id: string, status: SessionStatus, opts: Partial<{ center: string; client: string; guardian: string; test: string; type: PurchaseRow['purchase_type']; naver: NaverSummary; paid: string; phone: string }> = {}): PurchaseRow => ({
  id, purchase_type: opts.type === undefined ? 'test_main' : opts.type, product_name: null, paid_at: opts.paid ?? null, source: 'manual', created_at: '2026-10-12T00:00:00Z',
  naver_product_orders: opts.naver ?? null,
  naver_orderers: null,
  purchase_tests: [],
  applications: opts.client || opts.guardian || opts.test
    ? { client_name: opts.client ?? null, client_phone: opts.phone ?? null, guardian_name: opts.guardian ?? null, guardian_phone: null, test_name: opts.test ?? null, submitted_at: null, residence: null, preferred_method: null, preferred_schedule: null }
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


Deno.test('거르기: 이름(내담자·보호자), 구분, 센터(미배정 포함), 검사, 상태', () => {
  const ids = (f: Partial<typeof EMPTY_PURCHASE_FILTER>) => filterPurchases(rows, { ...EMPTY_PURCHASE_FILTER, ...f }).map((r) => r.id)
  assertEquals(ids({}), ['a', 'b', 'c', 'd'])
  assertEquals(ids({ q: '보호' }), ['c'])
  assertEquals(ids({ type: 'group_buy' }), ['b'])
  assertEquals(ids({ center: CENTER_NONE }), ['a', 'd'])
  assertEquals(ids({ center: 'c2' }), ['c'])
  assertEquals(ids({ test: 'K-CBCL', stage: 'request' }), ['b'])
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

// 진행 단계: 회차 하나짜리 구매 건을 상태·신청서·센터·예약 일시로 만든다
const staged = (status: SessionStatus, o: Partial<{ app: boolean; center: string; at: string }> = {}) => ({
  applications: o.app ? row('x', 'unassigned', { client: '가' }).applications : null,
  sessions: [{ id: 's', seq: 1, status, center_id: o.center ?? null, scheduled_at: o.at ?? null }],
})

Deno.test('진행 단계: 미배정은 신청서 유무로 나뉘고, 불가·취소는 멈춘 단계 아래로', () => {
  assertEquals(purchaseStage(staged('unassigned')), { stage: 'application', exit: null })
  assertEquals(purchaseStage(staged('unassigned', { app: true })), { stage: 'assign', exit: null })
  assertEquals(purchaseStage(staged('requested', { app: true, center: 'c' })), { stage: 'request', exit: null })
  assertEquals(purchaseStage(staged('completed', { app: true, center: 'c', at: 'x' })), { stage: 'completed', exit: null })
  assertEquals(purchaseStage(staged('unable', { app: true, center: 'c' })), { stage: 'request', exit: 'unable' })
  assertEquals(purchaseStage(staged('unable', { app: true, center: 'c', at: 'x' })), { stage: 'confirmed', exit: 'unable' })
  assertEquals(purchaseStage(staged('cancelled')), { stage: 'application', exit: 'cancelled' })
  assertEquals(purchaseStage(staged('cancelled', { app: true })), { stage: 'assign', exit: 'cancelled' })
  // 상담 회차가 없으면 검사만 산 주문
  assertEquals(purchaseStage({ applications: null, sessions: [] }), null)
})

Deno.test('단계별 건수와 단계 거르기', () => {
  const list = [
    { ...row('a', 'unassigned'), ...staged('unassigned') },
    { ...row('b', 'unassigned'), ...staged('unassigned', { app: true }) },
    { ...row('c', 'unassigned'), ...staged('cancelled', { app: true }) },
    { ...row('d', 'unassigned'), ...staged('unable', { app: true, center: 'c' }) },
    { ...row('e', 'unassigned'), sessions: [] },
  ]
  const c = countByStage(list)
  assertEquals([c.all, c.testOnly, c.stage.application, c.stage.assign, c.stage.request], [5, 1, 1, 1, 0])
  assertEquals([c.exit.assign.cancelled, c.exit.request.unable], [1, 1])
  const ids = (stage: string) => filterPurchases(list, { ...EMPTY_PURCHASE_FILTER, stage }).map((r) => r.id)
  assertEquals(ids('assign'), ['b'])
  assertEquals(ids('assign:cancelled'), ['c'])
  assertEquals(ids('request:unable'), ['d'])
  assertEquals(ids(STAGE_TEST_ONLY), ['e'])
})

Deno.test('기간 거르기: 한국 시각 날짜로, 구매일시가 없으면 기간을 고르면 빠진다', () => {
  assertEquals(periodRange('today', '2026-10-30'), { from: '2026-10-30', to: '2026-10-30' })
  assertEquals(periodRange('7d', '2026-10-30'), { from: '2026-10-24', to: '2026-10-30' })
  assertEquals(periodRange('30d', '2026-03-01'), { from: '2026-01-31', to: '2026-03-01' })
  assertEquals(periodRange('custom', '2026-10-30'), null)
  const list = [
    row('a', 'unassigned', { paid: '2026-10-29T15:30:00Z' }), // 한국 시각 10-30 00:30
    row('b', 'unassigned', { paid: '2026-10-29T14:30:00Z' }), // 한국 시각 10-29 23:30
    row('c', 'unassigned'),
  ]
  const ids = (from: string, to: string) => filterPurchases(list, { ...EMPTY_PURCHASE_FILTER, from, to }).map((r) => r.id)
  assertEquals(ids('', ''), ['a', 'b', 'c'])
  assertEquals(ids('2026-10-30', '2026-10-30'), ['a'])
  assertEquals(ids('', '2026-10-29'), ['b'])
})

Deno.test('연락처 표시와 검색(하이픈 없이 숫자 4자리 이상)', () => {
  const r = row('a', 'unassigned', { client: '김예시', phone: '010-1234-5678' })
  assertEquals(contactLabel(r), '010-1234-5678')
  assertEquals(contactLabel({ applications: null, naver_orderers: { name_masked: null, tel_masked: '010-****-5678' } }), '010-****-5678')
  assertEquals(contactLabel({ applications: null, naver_orderers: null }), null)
  const ids = (q: string) => filterPurchases([r], { ...EMPTY_PURCHASE_FILTER, q }).map((x) => x.id)
  assertEquals(ids('12345678'), ['a'])
  assertEquals(ids('1234-5678'), ['a'])
  assertEquals(ids('999'), [])
})
