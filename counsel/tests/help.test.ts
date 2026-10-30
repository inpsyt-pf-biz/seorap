// 서랍 도움말(10-30) 규칙을 DB 수준에서 확인한다: 관리 권한, 검사, 순서, 서랍 통로(서버 키만, 숨김 제외).
// 시험이 만든 질문은 '[시험H]'로 시작하고 끝나면 지운다. 문의처는 시험 전 값으로 되돌린다
import { assert, assertEquals } from '@std/assert'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { localEnv, localStatus, SEED_ACCOUNTS } from '../scripts/local.ts'

const status = await localStatus()
const env = await localEnv()
const opts = { db: { schema: 'counsel' }, auth: { persistSession: false, autoRefreshToken: false } }
async function as(key: (typeof SEED_ACCOUNTS)[number]['key']) {
  const c = createClient(status.apiUrl, status.publishableKey, opts)
  const { error } = await c.auth.signInWithPassword({ email: SEED_ACCOUNTS.find((a) => a.key === key)!.email, password: env.password })
  if (error) throw error
  return c
}
const service = createClient(status.apiUrl, status.serviceRoleKey, opts)
const admin = await as('admin')
const manager = await as('manager')
const sql = postgres(status.dbUrl, { max: 1, onnotice: () => {} })
const [{ contact_md: originalContact }] = await sql`select contact_md from counsel.help_settings`
// 순서 시험이 시험 질문 옆의 실제 질문과 자리를 맞바꿀 수 있다. 시작할 때의 실제 질문 순서를 기억했다가 되돌린다
const realOrder = await sql`select id from counsel.help_items where question not like '[시험H]%' order by position`
async function cleanup() {
  await sql`delete from counsel.help_items where question like '[시험H]%'`
  await sql`update counsel.help_settings set contact_md = ${originalContact}`
}
await cleanup()

const err = async (p: PromiseLike<{ error: { message?: string } | null }>) => (await p).error?.message ?? 'no error'
const save = (c = admin, p: Partial<{ id: string | null; q: string; a: string; buttons: unknown; hidden: boolean }> = {}) =>
  c.rpc('rpc_save_help_item', {
    p_id: p.id ?? null, p_question: p.q ?? `[시험H] ${crypto.randomUUID().slice(0, 6)}`, p_answer_md: p.a ?? '답 **굵게**',
    p_buttons: p.buttons ?? [], p_hidden: p.hidden ?? false,
  })

Deno.test('처음 값: 지금 도움말 5개가 들어 있다', async () => {
  const rows = await sql`select question from counsel.help_items where question not like '[시험H]%' order by position`
  assert(rows.length >= 5)
  assertEquals(rows[0].question, '문자가 안 와요')
})

Deno.test('관리자는 쓰고 고치고, 담당자는 못 쓴다', async () => {
  const { data: id, error } = await save()
  assertEquals(error, null)
  assertEquals(await err(save(admin, { id: id as string, q: '[시험H] 고친 질문' })), 'no error')
  assertEquals(await err(save(manager)), 'COUNSEL:FORBIDDEN')
  assertEquals(await err(manager.rpc('rpc_delete_help_item', { p_id: id })), 'COUNSEL:FORBIDDEN')
  assertEquals(await err(manager.rpc('rpc_save_help_contact', { p_contact_md: 'x' })), 'COUNSEL:FORBIDDEN')
  await cleanup()
})

Deno.test('규칙 위반은 INVALID_INPUT: 빈 질문·긴 답·버튼 3개·http 주소', async () => {
  assertEquals(await err(save(admin, { q: ' ' })), 'COUNSEL:INVALID_INPUT')
  assertEquals(await err(save(admin, { a: '가'.repeat(2001) })), 'COUNSEL:INVALID_INPUT')
  const b = { label: '열기', url: 'https://a.com' }
  assertEquals(await err(save(admin, { buttons: [b, b, b] })), 'COUNSEL:INVALID_INPUT')
  assertEquals(await err(save(admin, { buttons: [{ label: '열기', url: 'http://a.com' }] })), 'COUNSEL:INVALID_INPUT')
  assertEquals(await err(save(admin, { buttons: 'x' })), 'COUNSEL:INVALID_INPUT')
  assertEquals(await err(admin.rpc('rpc_save_help_contact', { p_contact_md: '가'.repeat(301) })), 'COUNSEL:INVALID_INPUT')
  await cleanup()
})

// Review Focus 5: 동시에 옮겨도 자리 번호가 겹치지 않는다
Deno.test('순서 바꾸기: 위·아래로 한 칸, 동시에 해도 자리 번호가 겹치지 않는다', async () => {
  const a = (await save(admin, { q: '[시험H] A' })).data as string
  const b = (await save(admin, { q: '[시험H] B' })).data as string
  await admin.rpc('rpc_move_help_item', { p_id: b, p_dir: -1 })
  const order = async () => (await sql`select question from counsel.help_items where question like '[시험H]%' order by position`).map((r) => r.question)
  assertEquals(await order(), ['[시험H] B', '[시험H] A'])
  await Promise.all([admin.rpc('rpc_move_help_item', { p_id: a, p_dir: -1 }), admin.rpc('rpc_move_help_item', { p_id: b, p_dir: 1 })])
  const [{ n, d }] = await sql`select count(*)::int as n, count(distinct position)::int as d from counsel.help_items`
  assertEquals(n, d)
  await cleanup()
})

Deno.test('서랍 통로: 서버 키만, 숨긴 질문은 빠지고 순서대로', async () => {
  await save(admin, { q: '[시험H] 보임' })
  await save(admin, { q: '[시험H] 숨김', hidden: true })
  await admin.rpc('rpc_save_help_contact', { p_contact_md: '[톡톡](https://talk.naver.com/x)' })
  assertEquals(await err(admin.rpc('rpc_seorap_help')), 'permission denied for function rpc_seorap_help')
  const { data, error } = await service.rpc('rpc_seorap_help')
  assertEquals(error, null)
  const d = data as { items: { question: string }[]; contact_md: string }
  const qs = d.items.map((i) => i.question)
  assert(qs.includes('[시험H] 보임'))
  assert(!qs.includes('[시험H] 숨김'))
  assertEquals(d.contact_md, '[톡톡](https://talk.naver.com/x)')
  await cleanup()
})

Deno.test('지우기: 없는 질문은 NOT_FOUND', async () => {
  const id = (await save()).data as string
  assertEquals(await err(admin.rpc('rpc_delete_help_item', { p_id: id })), 'no error')
  assertEquals(await err(admin.rpc('rpc_delete_help_item', { p_id: id })), 'COUNSEL:NOT_FOUND')
})

Deno.test({
  name: '정리: 실제 질문의 순서는 시험 전과 같다',
  fn: async () => {
    await cleanup()
    const after = await sql`select id from counsel.help_items where question not like '[시험H]%' order by position`
    assertEquals(after.map((r) => r.id), realOrder.map((r) => r.id))
    await sql.end()
  },
  sanitizeResources: false,
  sanitizeOps: false,
})
