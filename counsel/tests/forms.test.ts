// 상담 신청서 템플릿(서랍 B2) 규칙을 DB 수준에서 확인한다: 판 게시·불변, 권한, 상품 연결, 서랍 연결 통로(가져오기·제출).
// 시험이 만든 템플릿은 이름이 '[시험F]'로 시작, 네이버 상품주문번호는 77로 시작, 관리코드는 'TF-'로 시작하고, 끝나면 지운다.
import { assert, assertEquals, assertRejects } from '@std/assert'
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

async function cleanup() {
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`
    await tx`create temp table gone on commit drop as
      select purchase_id as id from counsel.naver_product_orders where naver_product_order_id like '77%'`
    await tx`delete from counsel.session_events where session_id in (select id from counsel.sessions where purchase_id in (select id from gone))`
    await tx`delete from counsel.sessions where purchase_id in (select id from gone)`
    for (const table of ['application_answers', 'naver_product_orders', 'application_sensitive', 'application_marketing', 'applications']) {
      await tx`delete from ${tx('counsel.' + table)} where purchase_id in (select id from gone)`
    }
    await tx`delete from counsel.purchases where id in (select id from gone)`
    await tx`delete from counsel.form_product_links where manage_code like 'TF-%'`
    await tx`delete from counsel.form_template_versions where template_id in (select id from counsel.form_templates where name like '[시험F]%')`
    await tx`delete from counsel.form_templates where name like '[시험F]%'`
  })
}
await cleanup()

const tag = () => crypto.randomUUID().slice(0, 6)
const id16 = () => '77' + Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => String(b % 10)).join('')
const DEF = {
  intro: '아래 문답에 답해 주세요.',
  fields: [
    { id: 'c1', type: 'consent', label: '개인정보 제3자 제공 동의', required: true, consentKind: 'third_party' },
    { id: 'name', type: 'short', label: '성함', required: true, mapsTo: 'client_name' },
  ],
}
const rpcOk = async <T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> => {
  const { data, error } = await p
  if (error) throw new Error(JSON.stringify(error))
  return data as T
}
const rpcErr = async (p: PromiseLike<{ data: unknown; error: { message?: string } | null }>) => (await p).error?.message ?? 'no error'

async function newPublished(name = `[시험F] ${tag()}`) {
  const id = await rpcOk<string>(admin.rpc('rpc_create_form_template', { p_name: name, p_draft: DEF }))
  const v = await rpcOk<number>(admin.rpc('rpc_publish_form_template', { p_id: id, p_version: 1 }))
  return { id, published: v }
}
async function link(code: string, templateId: string, enabled = true) {
  await rpcOk(admin.rpc('rpc_set_form_link', { p_manage_code: code, p_template_id: templateId, p_purchase_type: 'sponsored', p_enabled: enabled, p_label: '시험 상품' }))
}
const submission = (orderId: string, code: string, templateId: string, version: number, extra: Record<string, unknown> = {}) => ({
  naver_product_order_id: orderId, external_order_id: '2026102900001', manage_code: code, product_name: '시험 커플상담',
  template_id: templateId, template_version: version, submitted_at: new Date().toISOString(),
  application: { client_name: '홍길동', preferred_schedule: '평일 저녁', preferred_method: '화상', consent_third_party: true, medication_diagnosis: '수면제' },
  extra: [{ id: 'nick', label: '닉네임', value: 'X' }],
  sensitive_extra: [{ id: 'dx', label: '진단명', value: 'ADHD' }],
  consents: [{ id: 'c1', label: '개인정보 제3자 제공 동의', kind: 'third_party', agreed: true }],
  ...extra,
})

Deno.test({ name: '신청서 템플릿', sanitizeResources: false, sanitizeOps: false, fn: async (t) => {
  await t.step('관리자: 만들기 → 게시하면 1판, 초안을 고쳐 다시 게시하면 2판', async () => {
    const id = await rpcOk<string>(admin.rpc('rpc_create_form_template', { p_name: `[시험F] ${tag()}`, p_draft: DEF }))
    assertEquals(await rpcOk<number>(admin.rpc('rpc_publish_form_template', { p_id: id, p_version: 1 })), 1)
    const tpl = (await sql`select version from counsel.form_templates where id = ${id}`)[0]
    const draft2 = { ...DEF, intro: '바뀐 머리말' }
    const v = await rpcOk<number>(admin.rpc('rpc_save_form_draft', { p_id: id, p_version: tpl.version, p_name: null, p_draft: draft2 }))
    assertEquals(await rpcOk<number>(admin.rpc('rpc_publish_form_template', { p_id: id, p_version: v })), 2)
    const rows = await sql`select version, definition->>'intro' as intro from counsel.form_template_versions where template_id = ${id} order by version`
    assertEquals(rows.map((r) => [r.version, r.intro]), [[1, DEF.intro], [2, '바뀐 머리말']])
  })

  await t.step('게시한 판은 고치거나 지울 수 없다 (DB 가 막는다)', async () => {
    const { id } = await newPublished()
    await assertRejects(() => sql`update counsel.form_template_versions set definition = '{}'::jsonb where template_id = ${id}`)
    await assertRejects(() => sql`delete from counsel.form_template_versions where template_id = ${id}`)
  })

  await t.step('낡은 version 으로 저장하면 VERSION_CONFLICT, 문항이 없는 초안은 게시할 수 없다', async () => {
    const id = await rpcOk<string>(admin.rpc('rpc_create_form_template', { p_name: `[시험F] ${tag()}`, p_draft: { intro: '', fields: [] } }))
    assert((await rpcErr(admin.rpc('rpc_publish_form_template', { p_id: id, p_version: 1 }))).includes('COUNSEL:INVALID_INPUT'))
    await rpcOk(admin.rpc('rpc_save_form_draft', { p_id: id, p_version: 1, p_name: null, p_draft: DEF }))
    assert((await rpcErr(admin.rpc('rpc_save_form_draft', { p_id: id, p_version: 1, p_name: null, p_draft: DEF }))).includes('COUNSEL:VERSION_CONFLICT'))
  })

  await t.step('담당자는 읽기만: 만들기·게시·연결은 FORBIDDEN', async () => {
    const { id } = await newPublished()
    assert((await rpcErr(manager.rpc('rpc_create_form_template', { p_name: `[시험F] ${tag()}`, p_draft: DEF }))).includes('COUNSEL:FORBIDDEN'))
    assert((await rpcErr(manager.rpc('rpc_publish_form_template', { p_id: id, p_version: 2 }))).includes('COUNSEL:FORBIDDEN'))
    assert((await rpcErr(manager.rpc('rpc_set_form_link', { p_manage_code: 'TF-M', p_template_id: id, p_purchase_type: 'sponsored', p_enabled: true, p_label: null }))).includes('COUNSEL:FORBIDDEN'))
    const { data } = await manager.from('form_templates').select('id').eq('id', id)
    assertEquals(data?.length, 1)
  })

  await t.step('복제: 저장된 초안만 새 템플릿으로, 판·상품 연결은 따라가지 않는다. 같은 이름은 DUPLICATE_NAME, 담당자는 FORBIDDEN', async () => {
    const { id } = await newPublished()
    await link(`TF-${tag()}`, id)
    const name = `[시험F] ${tag()} 복사본`
    const copy = await rpcOk<string>(admin.rpc('rpc_duplicate_form_template', { p_id: id, p_name: name }))
    const [c] = await sql`select draft, published_version from counsel.form_templates where id = ${copy}`
    assertEquals([c.draft, c.published_version], [DEF, null])
    const links = await sql`select count(*)::int as n from counsel.form_product_links where template_id = ${copy}`
    assertEquals(links[0].n, 0)
    assert((await rpcErr(admin.rpc('rpc_duplicate_form_template', { p_id: id, p_name: name }))).includes('COUNSEL:DUPLICATE_NAME'))
    assert((await rpcErr(manager.rpc('rpc_duplicate_form_template', { p_id: id, p_name: `[시험F] ${tag()}` }))).includes('COUNSEL:FORBIDDEN'))
  })

  await t.step('관리코드 형식이 틀리면 INVALID_INPUT', async () => {
    const { id } = await newPublished()
    assert((await rpcErr(admin.rpc('rpc_set_form_link', { p_manage_code: '한글코드', p_template_id: id, p_purchase_type: 'sponsored', p_enabled: true, p_label: null }))).includes('COUNSEL:INVALID_INPUT'))
  })

  await t.step('서랍 가져오기: 연결된 상품의 최신 게시 판, 없거나 꺼졌으면 null', async () => {
    const { id } = await newPublished()
    const code = `TF-${tag()}`
    assertEquals(await rpcOk(service.rpc('rpc_seorap_form_for', { p_manage_code: code })), null)
    await link(code, id)
    const f = await rpcOk<{ template_id: string; version: number; flow: string; definition: { intro: string } }>(service.rpc('rpc_seorap_form_for', { p_manage_code: code }))
    assertEquals([f.template_id, f.version, f.flow, f.definition.intro], [id, 1, 'counsel_first', DEF.intro])
    await link(code, id, false)
    assertEquals(await rpcOk(service.rpc('rpc_seorap_form_for', { p_manage_code: code })), null)
  })

  await t.step('서랍 연결 통로는 직원 계정으로 부를 수 없다', async () => {
    assert((await rpcErr(admin.rpc('rpc_seorap_form_for', { p_manage_code: 'TF-X' }))) !== 'no error')
    assert((await rpcErr(admin.rpc('rpc_seorap_submit_application', { p: {} }))) !== 'no error')
  })

  await t.step('서랍 제출: 새 구매 건 + 신청서(기존 칸·민감·추가 답변·판 번호), 같은 주문으로 두 번 와도 한 건', async () => {
    const { id } = await newPublished()
    const code = `TF-${tag()}`
    await link(code, id)
    const order = id16()
    const a = await rpcOk<{ purchase_id: string; created: boolean }>(service.rpc('rpc_seorap_submit_application', { p: submission(order, code, id, 1) }))
    const b = await rpcOk<{ purchase_id: string; created: boolean }>(service.rpc('rpc_seorap_submit_application', { p: submission(order, code, id, 1) }))
    assertEquals([a.created, b.created, b.purchase_id], [true, false, a.purchase_id])
    const [p] = await sql`select purchase_type, source, product_name from counsel.purchases where id = ${a.purchase_id}`
    assertEquals([p.purchase_type, p.source, p.product_name], ['sponsored', 'seorap', '시험 커플상담'])
    const [app] = await sql`select client_name, preferred_schedule, preferred_method, consent_third_party from counsel.applications where purchase_id = ${a.purchase_id}`
    assertEquals([app.client_name, app.preferred_schedule, app.preferred_method, app.consent_third_party], ['홍길동', '평일 저녁', '화상', true])
    const [sen] = await sql`select medication_diagnosis, extra from counsel.application_sensitive where purchase_id = ${a.purchase_id}`
    assertEquals([sen.medication_diagnosis, sen.extra], ['수면제', [{ id: 'dx', label: '진단명', value: 'ADHD' }]])
    const [ans] = await sql`select template_id, template_version, extra from counsel.application_answers where purchase_id = ${a.purchase_id}`
    assertEquals([ans.template_id, ans.template_version, ans.extra], [id, 1, [{ id: 'nick', label: '닉네임', value: 'X' }]])
    const sessions = await sql`select count(*)::int as n from counsel.sessions where purchase_id = ${a.purchase_id}`
    assertEquals(sessions[0].n, 1)
  })

  await t.step('서랍 제출: 네이버로 먼저 들어온 구매 건이 있으면 그 건에 붙인다', async () => {
    const { id } = await newPublished()
    const code = `TF-${tag()}`
    await link(code, id)
    const order = id16()
    const [{ id: pid }] = await sql`insert into counsel.purchases (purchase_type, source, product_name) values ('sponsored', 'manual', '먼저 온 건') returning id`
    await sql`insert into counsel.naver_product_orders (purchase_id, naver_product_order_id) values (${pid}, ${order})`
    const r = await rpcOk<{ purchase_id: string; created: boolean }>(service.rpc('rpc_seorap_submit_application', { p: submission(order, code, id, 1) }))
    assertEquals([r.purchase_id, r.created], [pid, true])
  })

  await t.step('서랍 제출: 없는 판·연결되지 않은 상품은 INVALID_INPUT', async () => {
    const { id } = await newPublished()
    const code = `TF-${tag()}`
    assert((await rpcErr(service.rpc('rpc_seorap_submit_application', { p: submission(id16(), code, id, 1) }))).includes('COUNSEL:INVALID_INPUT'))
    await link(code, id)
    assert((await rpcErr(service.rpc('rpc_seorap_submit_application', { p: submission(id16(), code, id, 9) }))).includes('COUNSEL:INVALID_INPUT'))
  })
} })

Deno.test({ name: '정리', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  await cleanup()
  await sql.end()
} })
