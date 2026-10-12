// MVP-2 규칙을 DB 수준에서 확인한다: 상담 진행 바꾸기, 건 메모, 신청서 대기함(시트 → 주문에 붙이기), 센터 상담사.
// 시험이 만든 구매 건은 구매 시 메모가 '[시험2]', 네이버 상품주문번호는 66으로 시작, 상담사 이름은 '시험상담'으로 시작하고, 끝나면 지운다.
import { assert, assertEquals, assertRejects } from '@std/assert'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { toIntakeParts } from '../core/naverIntake.ts'
import { localEnv, localStatus, SEED_ACCOUNTS } from '../scripts/local.ts'

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
const MARK = '[시험2]'
const [{ started }] = await sql<{ started: Date }[]>`select now() as started`

async function cleanup() {
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`
    await tx`create temp table gone on commit drop as
      select id from counsel.purchases where purchase_memo = ${MARK}
      union select purchase_id from counsel.naver_product_orders where naver_product_order_id like '66%'`
    await tx`delete from counsel.session_events where session_id in (select id from counsel.sessions where purchase_id in (select id from gone))`
    await tx`delete from counsel.sessions where purchase_id in (select id from gone)`
    await tx`delete from counsel.purchase_notes where purchase_id in (select id from gone)`
    await tx`delete from counsel.application_inbox where created_at >= ${started} or resolved_purchase_id in (select id from gone)`
    for (const table of ['naver_orderers', 'naver_settlements', 'naver_product_orders', 'application_sensitive', 'application_marketing', 'applications']) {
      await tx`delete from ${tx('counsel.' + table)} where purchase_id in (select id from gone)`
    }
    await tx`delete from counsel.purchases where id in (select id from gone)`
    await tx`delete from counsel.center_counselors where name like '시험상담%'`
  })
}
await cleanup()

const tag = () => crypto.randomUUID().slice(0, 6)
const id16 = () => '66' + Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => String(b % 10)).join('')
const purchase = (application: Record<string, unknown> | null = { client_name: '가명' }) => ({
  p_purchase_type: 'test_main', p_naver_product_order_id: null, p_product_name: '', p_test_option: '', p_counsel_option: '', p_paid_at: null,
  p_purchase_memo: MARK, p_admin_memo: '', p_application: application,
})
const row = (key: string, name: string, order: string | null = null) => ({
  source_key: `${key}|${name}`, naver_product_order_id: order, purchase_memo: MARK, test_option: '', counsel_option: '', admin_memo: '[시트] 담당 메모',
  application: { submitted_at: '2026-10-10T10:00:00+09:00', client_name: name, client_phone: '010-0000-6600', consent_third_party: true },
})
async function intake(productOrderId: string, productId = '6600000099') {
  const { ordererPlain: _o, ...parts } = toIntakeParts({
    order: { orderId: id16(), paymentDate: '2026-10-09T09:00:00.000+09:00' },
    productOrder: { productOrderId, productOrderStatus: 'PAYED', productId, productName: '시험 상품', initialQuantity: 1, remainQuantity: 1 },
  }, new Date().toISOString())
  const r = await service.rpc('rpc_intake_naver_product_orders', { p_rows: [{ ...parts, orderer: null }] })
  assertEquals(r.error, null)
  return r.data
}
async function session(purchaseId: string) {
  const [s] = await sql<{ id: string; status: string; version: number; center_id: string | null; scheduled_at: Date | null }[]>`
    select id, status, version, center_id, scheduled_at from counsel.sessions where purchase_id = ${purchaseId} order by seq limit 1`
  return s
}
const update = (who: typeof admin, s: { id: string; version: number }, action: string, at: string | null = null, reason = '') =>
  who.rpc('rpc_update_session', { p_session_id: s.id, p_version: s.version, p_action: action, p_scheduled_at: at, p_method: at ? 'online' : null, p_reason: reason })

Deno.test({
  name: 'counsel MVP-2',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const centers = await sql<{ id: string }[]>`select id from counsel.centers where status = 'active' and not is_headquarters order by name limit 2`
    const [hq] = await sql<{ id: string }[]>`select id from counsel.centers where is_headquarters`

    await t.step('담당자 맥락: 상담 진행 바꾸기·메모 능력이 있다', async () => {
      const ctx = await manager.rpc('my_context')
      assertEquals(ctx.data.caps, ['note.write', 'purchase.manage', 'session.assign', 'session.manage'])
    })

    let pid = ''
    await t.step('예약 확정 → 예약 변경 → 상담 완료. 상태에 맞지 않는 일과 옛 version 은 거부하고, 이력에 일시·사유가 남는다', async () => {
      pid = (await manager.rpc('rpc_create_purchase', purchase())).data as string
      let s = await session(pid)
      assertEquals((await update(manager, s, 'confirm', '2026-10-20T10:00:00+09:00')).error?.message, 'COUNSEL:INVALID_TRANSITION')
      await manager.rpc('rpc_assign_sessions', { p_session_ids: [s.id], p_center_id: centers[0].id, p_note: '' })
      s = await session(pid)
      assertEquals((await update(nobody, s, 'confirm', '2026-10-20T10:00:00+09:00')).error?.message, 'COUNSEL:FORBIDDEN')
      assertEquals((await update(manager, s, 'confirm')).error?.message, 'COUNSEL:INVALID_INPUT')
      assertEquals((await update(manager, s, 'complete')).error?.message, 'COUNSEL:INVALID_TRANSITION')
      assertEquals((await update(manager, s, 'fly')).error?.message, 'COUNSEL:INVALID_INPUT')
      const ok = await update(manager, s, 'confirm', '2026-10-20T10:00:00+09:00', '센터 통화')
      assertEquals(ok.data, s.version + 1)
      assertEquals((await update(manager, s, 'reschedule', '2026-10-21T10:00:00+09:00', '보호자 요청')).error?.message, 'COUNSEL:VERSION_CONFLICT')
      s = await session(pid)
      assertEquals(s.status, 'confirmed')
      assertEquals((await update(manager, s, 'reschedule', '2026-10-21T10:00:00+09:00')).error?.message, 'COUNSEL:INVALID_INPUT')
      assertEquals((await update(manager, s, 'reschedule', '2026-10-21T10:00:00+09:00', '보호자 요청')).error, null)
      s = await session(pid)
      assertEquals((await update(manager, s, 'complete')).error, null)
      s = await session(pid)
      assertEquals(s.status, 'completed')
      assertEquals(s.scheduled_at?.toISOString(), '2026-10-21T01:00:00.000Z')
      assertEquals((await update(manager, s, 'cancel', null, '늦은 취소')).error?.message, 'COUNSEL:INVALID_TRANSITION')
      const events = await sql`select kind, from_status, to_status, from_scheduled_at, to_scheduled_at, note from counsel.session_events where session_id = ${s.id} order by id`
      assertEquals(events.map((e) => e.kind), ['created', 'assigned', 'status_changed', 'rescheduled', 'status_changed'])
      assertEquals([events[3].from_scheduled_at?.toISOString(), events[3].to_scheduled_at?.toISOString(), events[3].note], ['2026-10-20T01:00:00.000Z', '2026-10-21T01:00:00.000Z', '보호자 요청'])
      assertEquals((await admin.from('center_stats').select('completed_count').eq('center_id', centers[0].id).single()).data!.completed_count >= 1, true)
    })

    await t.step('상담 불가는 사유가 필요하고, 다른 센터로 다시 배정하면 예약 요청이 되고 예약 일시는 지운다', async () => {
      const p = (await manager.rpc('rpc_create_purchase', purchase())).data as string
      let s = await session(p)
      await manager.rpc('rpc_assign_sessions', { p_session_ids: [s.id], p_center_id: centers[0].id, p_note: '' })
      s = await session(p)
      await update(manager, s, 'confirm', '2026-10-22T10:00:00+09:00')
      s = await session(p)
      assertEquals((await update(manager, s, 'unable')).error?.message, 'COUNSEL:INVALID_INPUT')
      assertEquals((await update(manager, s, 'unable', null, '상담사 일정 없음')).error, null)
      s = await session(p)
      // 같은 센터로는 건너뛰고, 다른 센터로는 다시 배정된다
      assertEquals((await manager.rpc('rpc_assign_sessions', { p_session_ids: [s.id], p_center_id: centers[0].id, p_note: '' })).data, { assigned: 0, skipped: 1 })
      assertEquals((await manager.rpc('rpc_assign_sessions', { p_session_ids: [s.id], p_center_id: centers[1].id, p_note: '' })).data, { assigned: 1, skipped: 0 })
      s = await session(p)
      assertEquals([s.status, s.center_id, s.scheduled_at], ['requested', centers[1].id, null])
      // 미배정 회차도 사유를 적어 취소할 수 있다
      const q = (await manager.rpc('rpc_create_purchase', purchase())).data as string
      assertEquals((await update(manager, await session(q), 'cancel', null, '중복 등록')).error, null)
      assertEquals((await session(q)).status, 'cancelled')
    })

    await t.step('건 메모: 담당자가 남기고 본사가 읽고, 소속 없으면 못 쓰고 0행, 고치거나 지우지 못한다', async () => {
      assertEquals((await manager.rpc('rpc_add_purchase_note', { p_purchase_id: pid, p_body: '  ' })).error?.message, 'COUNSEL:INVALID_INPUT')
      assertEquals((await nobody.rpc('rpc_add_purchase_note', { p_purchase_id: pid, p_body: '메모' })).error?.message, 'COUNSEL:FORBIDDEN')
      assertEquals((await manager.rpc('rpc_add_purchase_note', { p_purchase_id: crypto.randomUUID(), p_body: '메모' })).error?.message, 'COUNSEL:NOT_FOUND')
      const id = (await manager.rpc('rpc_add_purchase_note', { p_purchase_id: pid, p_body: '센터와 통화함' })).data as number
      const read = await admin.from('purchase_notes').select('body, author').eq('id', id).single()
      assertEquals(read.data?.body, '센터와 통화함')
      assertEquals(read.data?.author, (await manager.auth.getUser()).data.user!.id)
      assertEquals((await nobody.from('purchase_notes').select('id')).data, [])
      assertEquals((await admin.from('purchase_notes').update({ body: 'x' }).eq('id', id)).error?.code, '42501')
      await assertRejects(() => sql`update counsel.purchase_notes set body = 'x' where id = ${id}`)
      await assertRejects(() => sql`delete from counsel.purchase_notes where id = ${id}`)
    })

    await t.step('시트 가져오기: 상품주문번호가 맞으면 그 네이버 건에 붙이고(미분류면 구분도 정함), 이미 신청서가 있으면 대기함으로', async () => {
      const order = id16()
      await intake(order)
      const [{ id: naverPid, purchase_type }] = await sql`select p.id, p.purchase_type from counsel.purchases p
        join counsel.naver_product_orders n on n.purchase_id = p.id where n.naver_product_order_id = ${order}`
      assertEquals(purchase_type, null)
      const k = tag()
      const one = await manager.rpc('rpc_import_applications', { p_purchase_type: 'test_main', p_rows: [row(k, '거너더', order)] })
      assertEquals(one.data, { attached: 1, waiting: 0, duplicates: 0 })
      const [p] = await sql`select p.purchase_type, p.admin_memo, a.client_name from counsel.purchases p join counsel.applications a on a.purchase_id = p.id where p.id = ${naverPid}`
      assertEquals([p.purchase_type, p.client_name, p.admin_memo], ['test_main', '거너더', '[시트] 담당 메모'])
      assertEquals((await manager.rpc('rpc_import_applications', { p_purchase_type: 'test_main', p_rows: [row(k, '거너더', order)] })).data, { attached: 0, waiting: 0, duplicates: 1 })
      // 같은 번호로 다른 신청서가 오면 붙이지 않고 대기함으로 보낸다
      assertEquals((await manager.rpc('rpc_import_applications', { p_purchase_type: 'test_main', p_rows: [row(k, '러머버', order)] })).data, { attached: 0, waiting: 1, duplicates: 0 })
      const [w] = await sql`select id, naver_product_order_id from counsel.application_inbox where status = 'waiting' and client_name = '러머버' and created_at >= ${started}`
      assertEquals(w.naver_product_order_id, order)
      assertEquals((await manager.rpc('rpc_attach_inbox', { p_inbox_id: w.id, p_purchase_id: naverPid })).error?.message, 'COUNSEL:ALREADY_HAS_APPLICATION')
      // 신청서 없는 다른 구매 건에는 붙고, 대기함 줄은 내용을 지운다
      const bare = (await manager.rpc('rpc_create_purchase', purchase(null))).data as string
      assertEquals((await nobody.rpc('rpc_attach_inbox', { p_inbox_id: w.id, p_purchase_id: bare })).error?.message, 'COUNSEL:FORBIDDEN')
      assertEquals((await manager.rpc('rpc_attach_inbox', { p_inbox_id: w.id, p_purchase_id: bare })).error, null)
      const [after] = await sql`select status, payload, client_name, resolved_purchase_id from counsel.application_inbox where id = ${w.id}`
      assertEquals([after.status, after.payload, after.client_name, after.resolved_purchase_id], ['attached', null, null, bare])
      assertEquals((await manager.rpc('rpc_attach_inbox', { p_inbox_id: w.id, p_purchase_id: bare })).error?.message, 'COUNSEL:NOT_FOUND')
      // 대기함은 본사만 읽는다
      assertEquals((await nobody.from('application_inbox').select('id')).data, [])
    })

    await t.step('대기함에서 새 구매 건 만들기: 적힌 상품주문번호를 달아 두어 나중에 네이버 주문이 오면 합쳐진다. 버리면 다시 가져와도 안 들어온다', async () => {
      const k = tag()
      const later = id16()
      await manager.rpc('rpc_import_applications', { p_purchase_type: 'sponsored', p_rows: [row(k, '모보소', later), row(k, '오조초')] })
      const ws = await sql`select id, client_name from counsel.application_inbox where status = 'waiting' and created_at >= ${started} and client_name in ('모보소', '오조초')`
      const make = ws.find((x) => x.client_name === '모보소')!
      const drop = ws.find((x) => x.client_name === '오조초')!
      assertEquals((await manager.rpc('rpc_create_from_inbox', { p_inbox_ids: [make.id] })).data, 1)
      const r = await intake(later)
      assertEquals(r, { created: 0, updated: 1, cancelled_sessions: 0, needs_review: 0 })
      const [p] = await sql`select p.source, p.purchase_type, (select count(*)::int from counsel.sessions s where s.purchase_id = p.id) as sessions
        from counsel.purchases p join counsel.naver_product_orders n on n.purchase_id = p.id where n.naver_product_order_id = ${later}`
      assertEquals([p.source, p.purchase_type, p.sessions], ['sheet_import', 'sponsored', 1])
      assertEquals((await manager.rpc('rpc_dismiss_inbox', { p_inbox_ids: [drop.id] })).data, 1)
      assertEquals((await manager.rpc('rpc_dismiss_inbox', { p_inbox_ids: [drop.id] })).data, 0)
      assertEquals((await manager.rpc('rpc_import_applications', { p_purchase_type: 'sponsored', p_rows: [row(k, '오조초')] })).data, { attached: 0, waiting: 0, duplicates: 1 })
    })

    await t.step('상담사: 관리자만 등록·수정하고, 옛 version·본사·빈 이름은 거부한다. 본사는 읽고 소속 없으면 0행', async () => {
      assertEquals((await manager.rpc('rpc_save_counselor', { p_id: null, p_version: 1, p_center_id: centers[0].id, p_name: '시험상담1', p_memo: '', p_active: true })).error?.message, 'COUNSEL:FORBIDDEN')
      assertEquals((await admin.rpc('rpc_save_counselor', { p_id: null, p_version: 1, p_center_id: hq.id, p_name: '시험상담1', p_memo: '', p_active: true })).error?.message, 'COUNSEL:NOT_FOUND')
      assertEquals((await admin.rpc('rpc_save_counselor', { p_id: null, p_version: 1, p_center_id: centers[0].id, p_name: '  ', p_memo: '', p_active: true })).error?.message, 'COUNSEL:INVALID_INPUT')
      const id = (await admin.rpc('rpc_save_counselor', { p_id: null, p_version: 1, p_center_id: centers[0].id, p_name: ' 시험상담1 ', p_memo: '놀이치료', p_active: true })).data as string
      assert(id)
      assertEquals((await admin.rpc('rpc_save_counselor', { p_id: id, p_version: 1, p_center_id: centers[0].id, p_name: '시험상담1', p_memo: '', p_active: false })).data, id)
      assertEquals((await admin.rpc('rpc_save_counselor', { p_id: id, p_version: 1, p_center_id: centers[0].id, p_name: '시험상담1', p_memo: '', p_active: true })).error?.message, 'COUNSEL:VERSION_CONFLICT')
      const read = await manager.from('center_counselors').select('name, memo, active, version').eq('id', id).single()
      assertEquals(read.data, { name: '시험상담1', memo: null, active: false, version: 2 })
      assertEquals((await nobody.from('center_counselors').select('id')).data, [])
    })

    await cleanup()
    await sql.end()
  },
})
