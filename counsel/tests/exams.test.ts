// 검사 실시 현황(purchase_tests) 규칙을 DB 수준에서 확인한다: 연동 전용 입구, 구매 건 찾기(상품주문번호 → 주문번호), 다시 받기, 읽기 권한.
// 시험이 만든 네이버 상품주문번호·주문번호는 55로 시작하고, 검사 줄의 source_ref 는 'exam-test:' 로 시작한다. 끝나면 지운다.
import { assert, assertEquals } from '@std/assert'
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
const anon = createClient(status.apiUrl, status.publishableKey, opts)
const admin = await as('admin')
const manager = await as('manager')
const nobody = await as('nobody')
const sql = postgres(status.dbUrl, { max: 1, onnotice: () => {} })

async function cleanup() {
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`
    await tx`delete from counsel.purchase_tests where source_ref like 'exam-test:%'`
    await tx`create temp table gone on commit drop as select purchase_id as id from counsel.naver_product_orders where naver_product_order_id like '55%'`
    await tx`delete from counsel.session_events where session_id in (select id from counsel.sessions where purchase_id in (select id from gone))`
    await tx`delete from counsel.purchase_tests where purchase_id in (select id from gone)`
    for (const table of ['sessions', 'naver_orderers', 'naver_settlements', 'naver_product_orders']) {
      await tx`delete from ${tx('counsel.' + table)} where purchase_id in (select id from gone)`
    }
    await tx`delete from counsel.purchases where id in (select id from gone)`
  })
}
await cleanup()

const id16 = () => '55' + Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => String(b % 10)).join('')
async function intake(productOrderId: string, orderId: string, productOrderStatus = 'PAYED') {
  const { ordererPlain: _o, ...parts } = toIntakeParts({
    order: { orderId, paymentDate: '2026-10-09T09:00:00.000+09:00' },
    productOrder: { productOrderId, productOrderStatus, productId: '5500000099', productName: '시험 상담 상품', initialQuantity: 1, remainQuantity: 1 },
  }, new Date().toISOString())
  const r = await service.rpc('rpc_intake_naver_product_orders', { p_rows: [{ ...parts, orderer: null }] })
  assertEquals(r.error, null)
  const [p] = await sql<{ id: string }[]>`select purchase_id as id from counsel.naver_product_orders where naver_product_order_id = ${productOrderId}`
  return p.id
}
const row = (ref: string, over: Record<string, unknown>) => ({ source_ref: `exam-test:${ref}`, test_name: '시험 검사', unit_no: 1, exam_status: 'unused', ...over })
const sync = (rows: unknown[]) => service.rpc('rpc_sync_purchase_tests', { p_rows: rows })

Deno.test({
  name: 'counsel 검사 실시 현황',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const order = id16()
    const counselOrder = id16()
    const pid = await intake(counselOrder, order)

    await t.step('입구는 연동 프로그램(service_role)만 부르고, 표에 직접 쓰지 못한다', async () => {
      assertEquals((await admin.rpc('rpc_sync_purchase_tests', { p_rows: [] })).error?.code, '42501')
      assertEquals((await admin.from('purchase_tests').insert({ purchase_id: pid, source_ref: 'x', test_name: 'x' })).error?.code, '42501')
      assertEquals((await sync([])).data, { upserted: 0, unmatched: 0 })
    })

    await t.step('붙일 구매 건: 같은 상품주문번호(패키지)가 먼저, 없으면 같은 주문번호(한 번 결제), 둘 다 없으면 건너뜀', async () => {
      const r = await sync([
        row('a', { naver_product_order_id: counselOrder, naver_order_id: order, test_name: 'STS 영아' }),
        row('b', { naver_product_order_id: id16(), naver_order_id: order, test_name: 'STS 성인확장', exam_status: 'in_progress', exam_started_at: '2026-10-10T10:00:00+09:00' }),
        row('c', { naver_product_order_id: id16(), naver_order_id: id16() }),
      ])
      assertEquals(r.data, { upserted: 2, unmatched: 1 })
      const tests = await sql`select test_name, exam_status from counsel.purchase_tests where purchase_id = ${pid} order by test_name`
      assertEquals(tests.map((x) => [x.test_name, x.exam_status]), [['STS 성인확장', 'in_progress'], ['STS 영아', 'unused']])
    })

    await t.step('같은 줄이 다시 오면 상태·응시자·결과지를 고친다(줄은 늘지 않음)', async () => {
      const r = await sync([row('a', {
        naver_order_id: order, test_name: 'STS 영아', exam_status: 'completed', exam_completed_at: '2026-10-11T10:00:00+09:00',
        respondent_name: '시험아기', result_url: 'https://example.com/r/1',
      })])
      assertEquals(r.data, { upserted: 1, unmatched: 0 })
      const [x] = await sql`select exam_status, respondent_name, result_url, (select count(*)::int from counsel.purchase_tests where source_ref like 'exam-test:%') as n
        from counsel.purchase_tests where source_ref = 'exam-test:a'`
      assertEquals([x.exam_status, x.respondent_name, x.result_url, x.n], ['completed', '시험아기', 'https://example.com/r/1', 2])
    })

    await t.step('한 결제에 상담 구매 건이 둘이면 취소·반품되지 않은 건에 붙인다', async () => {
      const shared = id16()
      const cancelled = await intake('55000000000000001' + id16().slice(-3), shared, 'CANCELED')
      const alive = await intake('55999999999999999' + id16().slice(-3), shared)
      assert(cancelled !== alive)
      assertEquals((await sync([row('g', { naver_product_order_id: id16(), naver_order_id: shared })])).data, { upserted: 1, unmatched: 0 })
      const [x] = await sql`select purchase_id from counsel.purchase_tests where source_ref = 'exam-test:g'`
      assertEquals(x.purchase_id, alive)
    })

    await t.step('잘못된 값(모르는 상태, https 가 아닌 결과지, 모르는 시간대)은 전체를 되돌리고 몇 번째 줄인지 알린다', async () => {
      const tz = await sync([row('h', { naver_order_id: order }), row('i', { naver_order_id: order, exam_started_at: '2026-10-10 10:00 Foo/Bar' })])
      assertEquals(tz.error?.message, 'COUNSEL:INVALID_INPUT')
      assert(String(tz.error?.details).startsWith('row 2'), String(tz.error?.details))
      const bad1 = await sync([row('d', { naver_order_id: order }), row('e', { naver_order_id: order, exam_status: 'started' })])
      assertEquals(bad1.error?.message, 'COUNSEL:INVALID_INPUT')
      assert(String(bad1.error?.details).startsWith('row 2'), String(bad1.error?.details))
      const bad2 = await sync([row('f', { naver_order_id: order, result_url: 'http://example.com/r' })])
      assertEquals(bad2.error?.message, 'COUNSEL:INVALID_INPUT')
      assertEquals((await sql`select count(*)::int as n from counsel.purchase_tests where source_ref in ('exam-test:d', 'exam-test:f', 'exam-test:h')`)[0].n, 0)
    })

    await t.step('읽기: 본사(관리자·담당자)는 보고, 소속 없음은 0행, 로그인 안 하면 거부', async () => {
      assertEquals((await manager.from('purchase_tests').select('test_name').eq('purchase_id', pid)).data?.length, 2)
      assertEquals((await admin.from('purchase_tests').select('result_url').eq('source_ref', 'exam-test:a').single()).data?.result_url, 'https://example.com/r/1')
      assertEquals((await nobody.from('purchase_tests').select('id')).data, [])
      assertEquals((await anon.from('purchase_tests').select('id')).error?.code, '42501')
    })

    await cleanup()
    await sql.end()
  },
})
