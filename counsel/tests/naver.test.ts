// 네이버 상품주문 입구·칸 규칙을 DB 수준에서 확인한다. 연동 프로그램과 같은 길(응답 모양 → naverIntake → 암호화 → service_role 입구)을 쓴다.
// 시험이 만든 상품주문번호·상품번호는 88로 시작하고, 끝나면 지운다(시연 시드는 건드리지 않는다).
import { assert, assertEquals } from '@std/assert'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { toIntakeParts, type NaverIntakeRow, type NaverProductOrderDetail } from '../core/naverIntake.ts'
import { localEnv, localStatus, SEED_ACCOUNTS } from '../scripts/local.ts'
import { piiTools } from '../scripts/pii.ts'

const status = await localStatus()
const env = await localEnv()
const opts = { db: { schema: 'counsel' }, auth: { persistSession: false, autoRefreshToken: false } }

async function as(key: (typeof SEED_ACCOUNTS)[number]['key']) {
  const c = createClient(status.apiUrl, status.publishableKey, opts)
  const email = SEED_ACCOUNTS.find((a) => a.key === key)!.email
  const { error } = await c.auth.signInWithPassword({ email, password: env.password })
  if (error) throw error
  return c
}

const service = createClient(status.apiUrl, status.serviceRoleKey, opts)
const admin = await as('admin')
const manager = await as('manager')
const nobody = await as('nobody')
const sql = postgres(status.dbUrl, { max: 1, onnotice: () => {} })
const pii = piiTools({ encKey: env.piiEncKey, hmacKey: env.piiHmacKey })

async function cleanup() {
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`
    const ids = tx`select purchase_id from counsel.naver_product_orders where naver_product_order_id like '88%'`
    await tx`delete from counsel.session_events where session_id in (select id from counsel.sessions where purchase_id in (${ids}))`
    await tx`delete from counsel.sessions where purchase_id in (${ids})`
    await tx`delete from counsel.naver_orderers where purchase_id in (${ids})`
    await tx`delete from counsel.naver_settlements where purchase_id in (${ids})`
    await tx`delete from counsel.applications where purchase_id in (${ids})`
    await tx`create temp table gone on commit drop as ${ids}`
    await tx`delete from counsel.naver_product_orders where purchase_id in (select purchase_id from gone)`
    await tx`delete from counsel.purchases where id in (select purchase_id from gone)`
    await tx`delete from counsel.naver_product_types where naver_product_id like '88%'`
  })
}
await cleanup()

const id16 = () => '88' + Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => String(b % 10)).join('')
const MAPPED = '8800000001' // 1단위당 상담 2회인 시험 상품
const UNMAPPED = '8800000099'

function detail(productOrderId: string, product: string, qty: number, po: Partial<NaverProductOrderDetail['productOrder']> = {}, claim?: NaverProductOrderDetail['currentClaim']): NaverProductOrderDetail {
  return {
    order: { orderId: id16(), orderDate: '2026-10-10T10:00:00.000+09:00', paymentDate: '2026-10-10T10:01:00.000+09:00', ordererName: '김시험', ordererTel: '010-0000-8888', ordererNo: '880001' },
    productOrder: {
      productOrderId, productOrderStatus: 'PAYED', productId: product, itemNo: product, productName: '시험 상품', productOption: '시험 옵션',
      initialQuantity: qty, remainQuantity: qty, initialPaymentAmount: 50000 * qty, remainPaymentAmount: 50000 * qty, expectedSettlementAmount: 47000 * qty,
      ...po,
    },
    ...(claim ? { currentClaim: claim } : {}),
  }
}

async function rows(details: NaverProductOrderDetail[]): Promise<NaverIntakeRow[]> {
  const out: NaverIntakeRow[] = []
  for (const d of details) {
    const { ordererPlain, ...parts } = toIntakeParts(d, new Date().toISOString())
    out.push({ ...parts, orderer: await pii.protect(ordererPlain) })
  }
  return out
}
const intake = async (details: NaverProductOrderDetail[]) => service.rpc('rpc_intake_naver_product_orders', { p_rows: await rows(details) })

async function purchaseOf(productOrderId: string) {
  const [p] = await sql<{ id: string; source: string; purchase_type: string | null; version: number; needs_review: boolean }[]>`
    select p.id, p.source, p.purchase_type, p.version, n.needs_review from counsel.purchases p
    join counsel.naver_product_orders n on n.purchase_id = p.id where n.naver_product_order_id = ${productOrderId}`
  return p
}
async function sessionStatuses(purchaseId: string) {
  return (await sql<{ status: string }[]>`select status from counsel.sessions where purchase_id = ${purchaseId} order by seq`).map((s) => s.status)
}

Deno.test({
  name: 'counsel 네이버 상품주문',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await sql`insert into counsel.naver_product_types (naver_product_id, purchase_type, sessions_per_unit, label) values (${MAPPED}, 'counsel_main', 2, '시험 상품')`

    await t.step('입구는 연동 프로그램(service_role)만 부른다. 로그인한 관리자도 못 부른다', async () => {
      const r = await admin.rpc('rpc_intake_naver_product_orders', { p_rows: [] })
      assertEquals(r.error?.code, '42501')
      const purge = await admin.rpc('rpc_purge_naver_orderers')
      assertEquals(purge.error?.code, '42501')
      assertEquals((await service.rpc('rpc_intake_naver_product_orders', { p_rows: [] })).data, { created: 0, updated: 0, cancelled_sessions: 0, needs_review: 0 })
    })

    await t.step('표에 직접 쓰는 길은 막혀 있다', async () => {
      assertEquals((await admin.from('naver_product_orders').insert({ purchase_id: crypto.randomUUID(), naver_product_order_id: id16() })).error?.code, '42501')
      assertEquals((await admin.from('naver_orderers').update({ name_masked: 'x' }).neq('purchase_id', crypto.randomUUID())).error?.code, '42501')
    })

    const first = id16()
    await t.step('처음 오는 주문: 구매 건(네이버·목록표 구분)과 상담 줄(수량 × 1단위당 횟수)이 생긴다', async () => {
      const r = await intake([detail(first, MAPPED, 2)])
      assertEquals(r.error, null)
      assertEquals(r.data, { created: 1, updated: 0, cancelled_sessions: 0, needs_review: 0 })
      const p = await purchaseOf(first)
      assertEquals([p.source, p.purchase_type], ['naver', 'counsel_main'])
      assertEquals(await sessionStatuses(p.id), ['unassigned', 'unassigned', 'unassigned', 'unassigned'])
      const n = await admin.from('naver_product_orders').select('option_name, quantity, payment_amount, product_order_status').eq('purchase_id', p.id).single()
      assertEquals(n.data, { option_name: '시험 옵션', quantity: 2, payment_amount: 100000, product_order_status: 'PAYED' })
      const [ev] = await sql`select kind, note from counsel.session_events where session_id in (select id from counsel.sessions where purchase_id = ${p.id}) limit 1`
      assertEquals([ev.kind, ev.note], ['imported', '네이버 주문'])
    })

    await t.step('같은 주문이 다시 와도 1건만 남는다', async () => {
      const r = await intake([detail(first, MAPPED, 2)])
      assertEquals(r.data, { created: 0, updated: 1, cancelled_sessions: 0, needs_review: 0 })
      const p = await purchaseOf(first)
      assertEquals((await sessionStatuses(p.id)).length, 4)
      assertEquals((await sql`select count(*)::int as n from counsel.naver_product_orders where naver_product_order_id = ${first}`)[0].n, 1)
    })

    await t.step('주문자: 화면 계정은 가린 값만 읽고, 암호문·짝 맞춤 값은 못 읽는다. 소속 없으면 0행', async () => {
      const p = await purchaseOf(first)
      const masked = await manager.from('naver_orderers').select('name_masked, tel_masked').eq('purchase_id', p.id).single()
      assertEquals(masked.data, { name_masked: '김*험', tel_masked: '010-****-8888' })
      for (const col of ['name_enc', 'tel_enc', 'tel_hash', 'orderer_no_hash']) {
        const r = await admin.from('naver_orderers').select(col).eq('purchase_id', p.id)
        assertEquals(r.error?.code, '42501', col)
      }
      assertEquals((await nobody.from('naver_orderers').select('name_masked')).data, [])
      assertEquals((await nobody.from('naver_product_orders').select('purchase_id')).data, [])
      // 저장된 연락처 HMAC 은 같은 키로 만든 신청서 연락처 HMAC 과 맞춰 볼 수 있다
      const [o] = await sql`select tel_hash, tel_enc from counsel.naver_orderers where purchase_id = ${p.id}`
      assertEquals(o.tel_hash, await pii.phoneHash('01000008888'))
      assert(String(o.tel_enc).startsWith('v1.') && !String(o.tel_enc).includes('8888'))
    })

    await t.step('정산 예정 금액은 관리자만 본다', async () => {
      const p = await purchaseOf(first)
      assertEquals((await admin.from('naver_settlements').select('expected_settlement_amount').eq('purchase_id', p.id).single()).data, { expected_settlement_amount: 94000 })
      assertEquals((await manager.from('naver_settlements').select('expected_settlement_amount').eq('purchase_id', p.id)).data, [])
    })

    await t.step('일부 취소: 남은 수량만큼만 남기고 뒤 회차부터 취소한다', async () => {
      const r = await intake([detail(first, MAPPED, 2, { claimType: 'CANCEL', claimStatus: 'CANCEL_DONE', remainQuantity: 1, remainPaymentAmount: 50000 })])
      assertEquals(r.data, { created: 0, updated: 1, cancelled_sessions: 2, needs_review: 0 })
      const p = await purchaseOf(first)
      assertEquals(await sessionStatuses(p.id), ['unassigned', 'unassigned', 'cancelled', 'cancelled'])
    })

    await t.step('예약 확정 이후 취소는 자동으로 바꾸지 않고 확인 필요로 표시한다. 확인하면 내린다', async () => {
      const p = await purchaseOf(first)
      await sql`update counsel.sessions set status = 'confirmed', center_id = (select id from counsel.centers where status = 'active' and not is_headquarters limit 1)
        where purchase_id = ${p.id} and seq = 1`
      const r = await intake([detail(first, MAPPED, 2, { productOrderStatus: 'CANCELED', claimType: 'CANCEL', claimStatus: 'CANCEL_DONE', remainQuantity: 0, remainPaymentAmount: 0 },
        { cancel: { claimRequestDate: '2026-10-11T09:00:00.000+09:00', cancelCompletedDate: '2026-10-11T10:00:00.000+09:00' } })])
      assertEquals(r.data, { created: 0, updated: 1, cancelled_sessions: 1, needs_review: 1 })
      assertEquals(await sessionStatuses(p.id), ['confirmed', 'cancelled', 'cancelled', 'cancelled'])
      assertEquals((await purchaseOf(first)).needs_review, true)
      const [n] = await sql`select closed_at from counsel.naver_product_orders where purchase_id = ${p.id}`
      assertEquals(new Date(n.closed_at).toISOString(), '2026-10-11T01:00:00.000Z')
      assertEquals((await nobody.rpc('rpc_resolve_naver_review', { p_purchase_id: p.id })).error?.message, 'COUNSEL:FORBIDDEN')
      assertEquals((await manager.rpc('rpc_resolve_naver_review', { p_purchase_id: p.id })).error, null)
      assertEquals((await purchaseOf(first)).needs_review, false)
      assertEquals((await manager.rpc('rpc_resolve_naver_review', { p_purchase_id: p.id })).error?.message, 'COUNSEL:NOT_FOUND')
    })

    await t.step('같은 주문을 다시 받아도 확인 필요가 다시 켜지지 않고, 거래 종료 시각·구매 건 version 은 그대로다', async () => {
      const p = await purchaseOf(first)
      const again = await intake([detail(first, MAPPED, 2, { productOrderStatus: 'CANCELED', claimType: 'CANCEL', claimStatus: 'CANCEL_DONE', remainQuantity: 0, remainPaymentAmount: 0 },
        { cancel: { claimRequestDate: '2026-10-11T09:00:00.000+09:00', cancelCompletedDate: '2026-10-12T10:00:00.000+09:00' } })])
      assertEquals(again.data, { created: 0, updated: 1, cancelled_sessions: 0, needs_review: 0 })
      const after = await purchaseOf(first)
      assertEquals([after.needs_review, after.version], [false, p.version])
      const [n] = await sql`select closed_at from counsel.naver_product_orders where purchase_id = ${p.id}`
      assertEquals(new Date(n.closed_at).toISOString(), '2026-10-11T01:00:00.000Z')
    })

    await t.step('1단위당 횟수는 처음 받을 때 값을 쓴다(목록표가 나중에 바뀌어도 기존 주문의 상담 줄은 그대로)', async () => {
      const order = id16()
      await intake([detail(order, MAPPED, 2)])
      const p = await purchaseOf(order)
      assertEquals((await sessionStatuses(p.id)).length, 4)
      await sql`update counsel.naver_product_types set sessions_per_unit = 1 where naver_product_id = ${MAPPED}`
      try {
        // 수량 2 중 1이 취소되면 남은 1 × 처음 값 2 = 2회를 남긴다(지금 목록표 값 1로 셈하면 3회를 취소하게 된다)
        const r = await intake([detail(order, MAPPED, 2, { claimType: 'CANCEL', claimStatus: 'CANCEL_DONE', remainQuantity: 1, remainPaymentAmount: 50000 })])
        assertEquals(r.data, { created: 0, updated: 1, cancelled_sessions: 2, needs_review: 0 })
        assertEquals(await sessionStatuses(p.id), ['unassigned', 'unassigned', 'cancelled', 'cancelled'])
      } finally {
        await sql`update counsel.naver_product_types set sessions_per_unit = 2 where naver_product_id = ${MAPPED}`
      }
    })

    await t.step('목록표에 없는 상품은 미분류로 들어오고, 사람이 구분을 정한다(옛 version 은 거부)', async () => {
      const other = id16()
      await intake([detail(other, UNMAPPED, 1)])
      const p = await purchaseOf(other)
      assertEquals([p.purchase_type, (await sessionStatuses(p.id)).length], [null, 1])
      assertEquals((await nobody.rpc('rpc_set_purchase_type', { p_purchase_id: p.id, p_version: p.version, p_purchase_type: 'test_main' })).error?.message, 'COUNSEL:FORBIDDEN')
      assertEquals((await manager.rpc('rpc_set_purchase_type', { p_purchase_id: p.id, p_version: p.version, p_purchase_type: 'nope' })).error?.message, 'COUNSEL:INVALID_INPUT')
      const ok = await manager.rpc('rpc_set_purchase_type', { p_purchase_id: p.id, p_version: p.version, p_purchase_type: 'test_main' })
      assertEquals(ok.data, p.version + 1)
      assertEquals((await manager.rpc('rpc_set_purchase_type', { p_purchase_id: p.id, p_version: p.version, p_purchase_type: 'group_buy' })).error?.message, 'COUNSEL:VERSION_CONFLICT')
      assertEquals((await purchaseOf(other)).purchase_type, 'test_main')
    })

    await t.step('직접 등록해 둔 상품주문번호로 주문이 오면 새로 만들지 않고 그 건을 채운다', async () => {
      const order = id16()
      const created = await manager.rpc('rpc_create_purchase', {
        p_purchase_type: 'sponsored', p_naver_product_order_id: order, p_product_name: '직접 쓴 상품명', p_test_option: '', p_counsel_option: '',
        p_paid_at: null, p_purchase_memo: '', p_admin_memo: '', p_application: null,
      })
      assertEquals(created.error, null)
      const r = await intake([detail(order, MAPPED, 1)])
      assertEquals(r.data, { created: 0, updated: 1, cancelled_sessions: 0, needs_review: 0 })
      const [p] = await sql`select p.id, p.source, p.purchase_type, p.product_name, p.paid_at, n.option_name from counsel.purchases p
        join counsel.naver_product_orders n on n.purchase_id = p.id where n.naver_product_order_id = ${order}`
      // 사람이 정한 구분·상품명은 그대로 두고, 빈 칸과 네이버 칸만 채운다
      assertEquals([p.source, p.purchase_type, p.product_name, p.option_name], ['manual', 'sponsored', '직접 쓴 상품명', '시험 옵션'])
      assert(p.paid_at !== null)
      // 직접 등록 때 1회였던 상담 줄을 수량 1 × 1단위당 2회로 채운다
      assertEquals(await sessionStatuses(p.id), ['unassigned', 'unassigned'])
    })

    await t.step('한 줄이라도 잘못되면 전체를 되돌리고 몇 번째 줄인지 알린다', async () => {
      const ok = id16()
      const bad = detail(id16(), MAPPED, 1, { initialQuantity: -1 })
      const r = await intake([detail(ok, MAPPED, 1), bad])
      assertEquals(r.error?.message, 'COUNSEL:INVALID_INPUT')
      assert(String(r.error?.details).startsWith('row 2'), String(r.error?.details))
      assertEquals((await sql`select count(*)::int as n from counsel.naver_product_orders where naver_product_order_id = ${ok}`)[0].n, 0)
    })

    await t.step('거래 종료 61일이 지난 주문자 정보만 지운다', async () => {
      const old = id16()
      const recent = id16()
      await intake([detail(old, MAPPED, 1), detail(recent, MAPPED, 1)])
      const o = await purchaseOf(old)
      const n = await purchaseOf(recent)
      const [{ granted }] = await sql`select has_function_privilege('service_role', 'counsel.rpc_purge_naver_orderers()', 'execute') as granted`
      assertEquals(granted, true)
      // 시연 시드의 주문자 정보까지 지워지지 않도록 트랜잭션 안에서 확인하고 되돌린다
      const ROLLBACK = new Error('rollback')
      await sql.begin(async (tx) => {
        await tx`update counsel.naver_product_orders set closed_at = now() - interval '62 days' where purchase_id = ${o.id}`
        await tx`update counsel.naver_product_orders set closed_at = now() - interval '1 day' where purchase_id = ${n.id}`
        await tx`select counsel.rpc_purge_naver_orderers()`
        assertEquals((await tx`select count(*)::int as c from counsel.naver_orderers where purchase_id = ${o.id}`)[0].c, 0)
        assertEquals((await tx`select count(*)::int as c from counsel.naver_orderers where purchase_id = ${n.id}`)[0].c, 1)
        throw ROLLBACK
      }).catch((e) => { if (e !== ROLLBACK) throw e })
    })

    await cleanup()
    await sql.end()
  },
})
