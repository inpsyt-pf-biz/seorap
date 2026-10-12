// 구매 건·신청서·상담 배정 규칙을 DB 수준에서 확인한다. 화면을 거치지 않는 직접 호출도 같은 결과여야 한다.
// 시험이 만든 구매 건은 구매 시 메모가 '[시험]', 센터는 이름이 '[시험]' 으로 시작하고, 끝나면 지운다(시연 시드는 건드리지 않는다).
import { assert, assertEquals, assertRejects } from '@std/assert'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { localEnv, localStatus, SEED_ACCOUNTS } from '../scripts/local.ts'

const status = await localStatus()
const { password } = await localEnv()
const opts = { db: { schema: 'counsel' }, auth: { persistSession: false, autoRefreshToken: false } }

async function as(key: (typeof SEED_ACCOUNTS)[number]['key']) {
  const c = createClient(status.apiUrl, status.publishableKey, opts)
  const email = SEED_ACCOUNTS.find((a) => a.key === key)!.email
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
  return c
}

const anon = createClient(status.apiUrl, status.publishableKey, opts)
const admin = await as('admin')
const manager = await as('manager')
const nobody = await as('nobody')

const sql = postgres(status.dbUrl, { max: 1, onnotice: () => {} })
const MARK = '[시험]'

// 상담 기록(session_events)은 지우지 못하게 막혀 있어서, 시험 뒷정리에서만 트리거를 끄고 지운다.
async function cleanup() {
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`
    const ids = tx`select id from counsel.purchases where purchase_memo = ${MARK}`
    await tx`delete from counsel.session_events where session_id in (select id from counsel.sessions where purchase_id in (${ids}))`
    await tx`delete from counsel.sessions where purchase_id in (${ids})`
    await tx`delete from counsel.application_sensitive where purchase_id in (${ids})`
    await tx`delete from counsel.application_marketing where purchase_id in (${ids})`
    await tx`delete from counsel.applications where purchase_id in (${ids})`
    await tx`delete from counsel.purchases where purchase_memo = ${MARK}`
  })
  await sql`delete from counsel.centers where name like '[시험]%'`
}
await cleanup()

const tag = () => crypto.randomUUID().slice(0, 6)
const center = (s: string, st: string) => ({
  p_name: `${MARK} ${s} ${tag()}`, p_status: st, p_location_sido: '서울', p_location_sigungu: '강남',
  p_latitude: null, p_longitude: null, p_target_groups: ['child_youth'], p_specialties: ['development'], p_regions: ['서울'], p_delivery_modes: ['offline'],
  p_phone: '', p_address: '', p_operating_hours: '', p_contact_name: '', p_contact_phone: '', p_contract_from: null, p_contract_to: null, p_memo: '',
})
const purchase = (application: Record<string, unknown> | null, order: string | null = null) => ({
  p_purchase_type: 'test_main', p_order_no: order, p_product_name: '', p_test_option: '', p_counsel_option: '', p_paid_on: null,
  p_purchase_memo: MARK, p_admin_memo: '', p_application: application,
})
const importRow = (key: string, name: string) => ({
  source_key: key, purchase_memo: MARK, test_option: '', counsel_option: '', admin_memo: '',
  application: { submitted_at: '2026-10-01T10:00:00+09:00', client_name: name, client_phone: '010-0000-9000', consent_third_party: true },
})

async function sessionOf(purchaseId: string) {
  const [s] = await sql<{ id: string; status: string; center_id: string | null }[]>`
    select id, status, center_id from counsel.sessions where purchase_id = ${purchaseId}`
  return s
}
async function eventKinds(sessionId: string) {
  return (await sql<{ kind: string }[]>`select kind from counsel.session_events where session_id = ${sessionId} order by id`).map((e) => e.kind)
}
async function stats(centerId: string) {
  const { data } = await admin.from('center_stats').select('assigned_count, completed_count').eq('center_id', centerId).single()
  return data
}

Deno.test({
  name: 'counsel 구매 건·배정',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const ids = {} as Record<'active' | 'active2' | 'paused' | 'onboarding', string>
    for (const [k, st] of [['active', 'active'], ['active2', 'active'], ['paused', 'paused'], ['onboarding', 'onboarding']] as const) {
      const { data, error } = await admin.rpc('rpc_create_center', center(k, st))
      assertEquals(error, null)
      ids[k] = data as string
    }

    await t.step('로그인하지 않은 요청은 구매 건·신청서를 읽지 못한다', async () => {
      for (const table of ['purchases', 'applications', 'application_sensitive', 'sessions']) {
        const { error } = await anon.from(table).select('*')
        assertEquals(error?.code, '42501', table)
      }
    })

    await t.step('담당자는 구매 건 등록·배정 능력이 있고 센터 관리는 없다', async () => {
      const ctx = await manager.rpc('my_context')
      assertEquals(ctx.data.caps, ['purchase.manage', 'session.assign'])
    })

    await t.step('소속 없는 계정은 0행이고 등록·가져오기·배정을 못 한다', async () => {
      assertEquals((await nobody.from('purchases').select('id')).data, [])
      assertEquals((await nobody.from('application_sensitive').select('purchase_id')).data, [])
      assertEquals((await nobody.rpc('rpc_create_purchase', purchase({ client_name: '가명' }))).error?.message, 'COUNSEL:FORBIDDEN')
      assertEquals((await nobody.rpc('rpc_import_applications', { p_purchase_type: 'test_main', p_rows: [importRow('x', '가명')] })).error?.message, 'COUNSEL:FORBIDDEN')
      assertEquals((await nobody.rpc('rpc_assign_sessions', { p_session_ids: [], p_center_id: ids.active, p_note: '' })).error?.message, 'COUNSEL:FORBIDDEN')
    })

    await t.step('표에 직접 쓰는 길은 막혀 있다', async () => {
      assertEquals((await admin.from('purchases').insert({ purchase_type: 'test_main', source: 'manual' })).error?.code, '42501')
      assertEquals((await admin.from('sessions').update({ status: 'completed' }).eq('status', 'unassigned')).error?.code, '42501')
      assertEquals((await admin.from('session_events').insert({ session_id: crypto.randomUUID(), kind: 'created' })).error?.code, '42501')
    })

    let first = ''
    await t.step('등록하면 신청서는 일반·민감·마케팅 칸이 나뉘어 들어가고, 미배정 상담 1회가 생긴다', async () => {
      const order = `T-${tag()}`
      const { data, error } = await manager.rpc('rpc_create_purchase', purchase({
        client_name: '가나다', guardian_name: '', test_name: '시험 검사', consent_third_party: true,
        medication_diagnosis: '시험 진단명', result_file_url: '', referral_source: '검색',
      }, order))
      assertEquals(error, null)
      first = data as string
      const a = await admin.from('applications').select('client_name, guardian_name, consent_third_party').eq('purchase_id', first).single()
      assertEquals(a.data, { client_name: '가나다', guardian_name: null, consent_third_party: true })
      const sens = await admin.from('application_sensitive').select('medication_diagnosis, result_file_url').eq('purchase_id', first).single()
      assertEquals(sens.data, { medication_diagnosis: '시험 진단명', result_file_url: null })
      const mk = await admin.from('application_marketing').select('referral_source').eq('purchase_id', first).single()
      assertEquals(mk.data?.referral_source, '검색')
      const s = await sessionOf(first)
      assertEquals([s.status, s.center_id], ['unassigned', null])
      assertEquals(await eventKinds(s.id), ['created'])

      const dup = await manager.rpc('rpc_create_purchase', purchase(null, order))
      assertEquals(dup.error?.message, 'COUNSEL:DUPLICATE_ORDER')
    })

    await t.step('신청서 없이도 등록되고, 너무 긴 칸·객체가 아닌 신청서는 INVALID_INPUT 이며 아무것도 남지 않는다', async () => {
      const bare = await manager.rpc('rpc_create_purchase', purchase(null))
      assertEquals(bare.error, null)
      assertEquals((await admin.from('applications').select('purchase_id').eq('purchase_id', bare.data as string)).data, [])
      const before = (await sql`select count(*)::int as n from counsel.purchases`)[0].n
      const long = await manager.rpc('rpc_create_purchase', purchase({ client_name: '가'.repeat(51) }))
      assertEquals(long.error?.message, 'COUNSEL:INVALID_INPUT')
      // JSON 을 문자열로 한 번 더 감싼 값(빈 신청서로 들어가던 실수)
      const wrapped = await manager.rpc('rpc_create_purchase', { ...purchase(null), p_application: JSON.stringify({ client_name: '가나다' }) })
      assertEquals(wrapped.error?.message, 'COUNSEL:INVALID_INPUT')
      assertEquals((await sql`select count(*)::int as n from counsel.purchases`)[0].n, before)
    })

    await t.step('운영 중이 아닌 센터·본사에는 배정하지 못한다', async () => {
      const s = await sessionOf(first)
      const [hq] = await sql<{ id: string }[]>`select id from counsel.centers where is_headquarters`
      for (const c of [ids.paused, ids.onboarding, hq.id, crypto.randomUUID()]) {
        const { error } = await manager.rpc('rpc_assign_sessions', { p_session_ids: [s.id], p_center_id: c, p_note: '' })
        assertEquals(error?.message, 'COUNSEL:CENTER_NOT_ASSIGNABLE')
      }
      assertEquals((await sessionOf(first)).status, 'unassigned')
    })

    await t.step('배정하면 예약 요청이 되고, 같은 센터는 건너뛰고, 다른 센터로 다시 배정된다', async () => {
      const s = await sessionOf(first)
      const one = await manager.rpc('rpc_assign_sessions', { p_session_ids: [s.id], p_center_id: ids.active, p_note: '시험 배정' })
      assertEquals(one.data, { assigned: 1, skipped: 0 })
      assertEquals(await sessionOf(first), { id: s.id, status: 'requested', center_id: ids.active })
      const same = await manager.rpc('rpc_assign_sessions', { p_session_ids: [s.id], p_center_id: ids.active, p_note: '' })
      assertEquals(same.data, { assigned: 0, skipped: 1 })
      const again = await manager.rpc('rpc_assign_sessions', { p_session_ids: [s.id], p_center_id: ids.active2, p_note: '' })
      assertEquals(again.data, { assigned: 1, skipped: 0 })
      assertEquals(await eventKinds(s.id), ['created', 'assigned', 'reassigned'])
      const [ev] = await sql`select from_center, to_center from counsel.session_events where session_id = ${s.id} and kind = 'reassigned'`
      assertEquals([ev.from_center, ev.to_center], [ids.active, ids.active2])
    })

    await t.step('예약 확정 이후 상태와 없는 상담은 건너뛴다. 센터 건수는 취소를 빼고 센다', async () => {
      const p2 = (await manager.rpc('rpc_create_purchase', purchase({ client_name: '라마바' }))).data as string
      const s2 = await sessionOf(p2)
      const r = await manager.rpc('rpc_assign_sessions', { p_session_ids: [s2.id, crypto.randomUUID()], p_center_id: ids.active2, p_note: '' })
      assertEquals(r.data, { assigned: 1, skipped: 1 })
      await sql`update counsel.sessions set status = 'completed' where id = ${s2.id}`
      const late = await manager.rpc('rpc_assign_sessions', { p_session_ids: [s2.id], p_center_id: ids.active, p_note: '' })
      assertEquals(late.data, { assigned: 0, skipped: 1 })
      assertEquals(await stats(ids.active2), { assigned_count: 2, completed_count: 1 })
      assertEquals(await stats(ids.active), { assigned_count: 0, completed_count: 0 })
      await sql`update counsel.sessions set status = 'cancelled' where id = ${(await sessionOf(first)).id}`
      assertEquals(await stats(ids.active2), { assigned_count: 1, completed_count: 1 })
    })

    await t.step('미배정 상태로 센터가 남거나, 예약 요청인데 센터가 없는 줄은 DB가 거부한다', async () => {
      const s = await sessionOf(first)
      await assertRejects(() => sql`update counsel.sessions set status = 'unassigned', center_id = ${ids.active} where id = ${s.id}`)
      await assertRejects(() => sql`update counsel.sessions set status = 'requested', center_id = null where id = ${s.id}`)
    })

    await t.step('상담 기록은 고치거나 지울 수 없다', async () => {
      const s = await sessionOf(first)
      await assertRejects(() => sql`update counsel.session_events set note = 'x' where session_id = ${s.id}`)
      await assertRejects(() => sql`delete from counsel.session_events where session_id = ${s.id}`)
    })

    await t.step('시트 가져오기: 같은 줄은 한 번만 들어가고, 한 줄이라도 잘못되면 전체를 되돌린다', async () => {
      const k = tag()
      const rows = [importRow(`${k}-1`, '사아자'), importRow(`${k}-2`, '차카타')]
      const one = await manager.rpc('rpc_import_applications', { p_purchase_type: 'group_buy', p_rows: rows })
      assertEquals(one.data, { inserted: 2, duplicates: 0 })
      const two = await manager.rpc('rpc_import_applications', { p_purchase_type: 'group_buy', p_rows: rows })
      assertEquals(two.data, { inserted: 0, duplicates: 2 })
      // 같은 열쇠라도 신청서 종류가 다르면 다른 건이다
      const other = await manager.rpc('rpc_import_applications', { p_purchase_type: 'sponsored', p_rows: [rows[0]] })
      assertEquals(other.data, { inserted: 1, duplicates: 0 })

      const before = (await sql`select count(*)::int as n from counsel.purchases`)[0].n
      const bad = await manager.rpc('rpc_import_applications', {
        p_purchase_type: 'group_buy', p_rows: [importRow(`${k}-3`, '타파하'), importRow(`${k}-4`, '가'.repeat(51))],
      })
      assertEquals(bad.error?.message, 'COUNSEL:INVALID_INPUT')
      assert(String(bad.error?.details).startsWith('row 2'), String(bad.error?.details))
      assertEquals((await sql`select count(*)::int as n from counsel.purchases`)[0].n, before)

      const [imp] = await sql`select p.source, s.status from counsel.purchases p join counsel.sessions s on s.purchase_id = p.id
        join counsel.applications a on a.purchase_id = p.id where a.client_name = '사아자' and p.purchase_type = 'group_buy' and p.purchase_memo = ${MARK}`
      assertEquals([imp.source, imp.status], ['sheet_import', 'unassigned'])
    })

    await cleanup()
    await sql.end()
  },
})
