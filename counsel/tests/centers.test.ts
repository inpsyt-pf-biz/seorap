// 권한과 쓰기 규칙을 DB 수준에서 확인한다. 화면을 거치지 않는 직접 호출도 같은 결과여야 한다.
// 시험이 만든 센터는 이름이 '[시험]' 으로 시작하고, 끝나면 지운다(시연 시드는 건드리지 않는다).
import { assert, assertEquals } from '@std/assert'
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
async function cleanup() {
  await sql`delete from counsel.centers where name like '[시험]%'`
}
await cleanup()

const name = (s: string) => `[시험] ${s} ${crypto.randomUUID().slice(0, 6)}`
const input = (n: string) => ({
  p_name: n, p_status: 'active', p_location_sido: '서울', p_location_sigungu: '강남',
  p_latitude: 37.5172 as number | null, p_longitude: 127.0473 as number | null, p_target_groups: ['child_youth'], p_specialties: ['development'],
  p_regions: ['서울'], p_delivery_modes: ['offline'],
  p_phone: '02-0000-9999', p_address: '', p_operating_hours: '', p_contact_name: '', p_contact_phone: '', p_contract_from: null, p_contract_to: null, p_memo: '',
})

Deno.test({
  name: 'counsel 권한',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step('로그인하지 않은 요청은 counsel 표를 읽지 못한다', async () => {
      const { data, error } = await anon.from('centers').select('id')
      assertEquals(data, null)
      assertEquals(error?.code, '42501')
    })

    await t.step('아무나 가입할 수 없다(계정은 관리자가 만든다)', async () => {
      const { data, error } = await anon.auth.signUp({ email: `outsider-${crypto.randomUUID().slice(0, 6)}@counsel.test`, password: 'Outsider-1234' })
      assertEquals(data.user, null)
      assertEquals(error?.code, 'signup_disabled')
    })

    await t.step('관리자는 시드 센터 7곳을 본다', async () => {
      const { data, error } = await admin.from('centers').select('id').eq('is_headquarters', false).not('name', 'like', '[시험]%')
      assertEquals(error, null)
      assertEquals(data?.length, 7)
    })

    await t.step('담당자는 목록을 보지만 등록하지 못한다', async () => {
      const list = await manager.from('centers').select('id').eq('is_headquarters', false)
      assert((list.data?.length ?? 0) >= 7)
      const { error } = await manager.rpc('rpc_create_center', input(name('담당자')))
      assertEquals(error?.message, 'COUNSEL:FORBIDDEN')
    })

    await t.step('소속 없는 계정은 0행이고, 등록하지 못하고, 소속이 비어 있다', async () => {
      const list = await nobody.from('centers').select('id')
      assertEquals(list.data, [])
      const { error } = await nobody.rpc('rpc_create_center', input(name('소속없음')))
      assertEquals(error?.message, 'COUNSEL:FORBIDDEN')
      const ctx = await nobody.rpc('my_context')
      assertEquals(ctx.data.membership, null)
      assertEquals(ctx.data.caps, [])
    })

    await t.step('관리자 맥락에는 본사 소속과 본사 능력(센터·구매 건·배정·진행·메모·정산 보기)이 모두 있다', async () => {
      const ctx = await admin.rpc('my_context')
      assertEquals(ctx.data.membership.is_headquarters, true)
      assertEquals(ctx.data.membership.role, 'hq_admin')
      assertEquals(ctx.data.caps, ['center.manage', 'note.write', 'purchase.manage', 'session.assign', 'session.manage', 'settlement.view'])
    })

    await t.step('표에 직접 쓰는 길은 막혀 있다', async () => {
      const ins = await admin.from('centers').insert({ name: name('직접') })
      assertEquals(ins.error?.code, '42501')
      const upd = await admin.from('centers').update({ memo: 'x' }).eq('is_headquarters', false)
      assertEquals(upd.error?.code, '42501')
    })

    await t.step('등록 → 수정하면 version 이 오르고, 옛 version 으로 수정하면 거부된다', async () => {
      const n = name('동시편집')
      const created = await admin.rpc('rpc_create_center', input(n))
      assertEquals(created.error, null)
      const id = created.data as string
      const first = await admin.rpc('rpc_update_center', { p_id: id, p_version: 1, ...input(n), p_memo: '첫 수정' })
      assertEquals(first.data, 2)
      const stale = await admin.rpc('rpc_update_center', { p_id: id, p_version: 1, ...input(n), p_memo: '늦은 수정' })
      assertEquals(stale.error?.message, 'COUNSEL:VERSION_CONFLICT')
      assertEquals(stale.error?.details, '2')
      const row = await admin.from('centers').select('memo, version').eq('id', id).single()
      assertEquals(row.data, { memo: '첫 수정', version: 2 })
    })

    await t.step('같은 이름(대소문자 무시)은 등록하지 못한다', async () => {
      const n = name('Dup')
      assertEquals((await admin.rpc('rpc_create_center', input(n))).error, null)
      const again = await admin.rpc('rpc_create_center', input(n.toLowerCase()))
      assertEquals(again.error?.message, 'COUNSEL:DUPLICATE_NAME')
    })

    await t.step('허용값 밖의 권역·잘못된 계약 기간은 INVALID_INPUT', async () => {
      const bad = await admin.rpc('rpc_create_center', { ...input(name('권역')), p_regions: ['서울시'] })
      assertEquals(bad.error?.message, 'COUNSEL:INVALID_INPUT')
      const period = await admin.rpc('rpc_create_center', { ...input(name('기간')), p_contract_from: '2026-12-31', p_contract_to: '2026-01-01' })
      assertEquals(period.error?.message, 'COUNSEL:INVALID_INPUT')
    })

    await t.step('목록에 없는 전문 분야·대상, 시·도 없는 구·시는 INVALID_INPUT', async () => {
      const cat = await admin.rpc('rpc_create_center', { ...input(name('전문분야')), p_specialties: ['individual'] })
      assertEquals(cat.error?.message, 'COUNSEL:INVALID_INPUT')
      const target = await admin.rpc('rpc_create_center', { ...input(name('대상')), p_target_groups: ['senior'] })
      assertEquals(target.error?.message, 'COUNSEL:INVALID_INPUT')
      const loc = await admin.rpc('rpc_create_center', { ...input(name('소재지')), p_location_sido: '', p_location_sigungu: '강남' })
      assertEquals(loc.error?.message, 'COUNSEL:INVALID_INPUT')
    })

    await t.step('지도 위치: 국내 밖 좌표, 위도·경도 한쪽만 있는 값은 INVALID_INPUT', async () => {
      const abroad = await admin.rpc('rpc_create_center', { ...input(name('해외')), p_latitude: 35.68, p_longitude: 139.69 })
      assertEquals(abroad.error?.message, 'COUNSEL:INVALID_INPUT')
      const half = await admin.rpc('rpc_create_center', { ...input(name('반쪽')), p_longitude: null })
      assertEquals(half.error?.message, 'COUNSEL:INVALID_INPUT')
      const none = await admin.rpc('rpc_create_center', { ...input(name('위치없음')), p_latitude: null, p_longitude: null })
      assertEquals(none.error, null)
    })

    await t.step('등록한 소재지·카테고리가 그대로 읽힌다', async () => {
      const n = name('소재지읽기')
      const created = await admin.rpc('rpc_create_center', { ...input(n), p_specialties: ['family', 'emotion', 'family'], p_operating_hours: ' 평일 10:00~19:00 ' })
      const row = await admin.from('centers').select('location_sido, location_sigungu, latitude, longitude, target_groups, specialties, operating_hours').eq('id', created.data).single()
      assertEquals(row.data, { location_sido: '서울', location_sigungu: '강남', latitude: 37.5172, longitude: 127.0473, target_groups: ['child_youth'], specialties: ['emotion', 'family'], operating_hours: '평일 10:00~19:00' })
    })

    await t.step('본사 행은 수정 함수로 고치지 못하고, 없는 센터와 같은 응답이다', async () => {
      const [hq] = await sql<{ id: string; version: number }[]>`select id, version from counsel.centers where is_headquarters`
      const r = await admin.rpc('rpc_update_center', { p_id: hq.id, p_version: hq.version, ...input('인싸이트 본사') })
      assertEquals(r.error?.message, 'COUNSEL:NOT_FOUND')
      const missing = await admin.rpc('rpc_update_center', { p_id: crypto.randomUUID(), p_version: 1, ...input(name('없음')) })
      assertEquals(missing.error?.message, 'COUNSEL:NOT_FOUND')
    })

    await t.step('소속을 끝내면 다음 요청부터 바로 0행이다', async () => {
      const managerId = (await manager.auth.getUser()).data.user!.id
      await sql`update counsel.center_members set left_at = now() where user_id = ${managerId} and left_at is null`
      try {
        const list = await manager.from('centers').select('id')
        assertEquals(list.data, [])
      } finally {
        await sql`update counsel.center_members set left_at = null where user_id = ${managerId} and left_at = (select max(left_at) from counsel.center_members where user_id = ${managerId})`
      }
    })

    await cleanup()
    await sql.end()
  },
})
