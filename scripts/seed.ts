// 시드 시나리오 (로컬·미리보기 전용). 실행 전 supabase db reset 으로 비운다.
// 필요 환경변수: SEED_SUPABASE_URL, SEED_SERVICE_ROLE_KEY, SEED_KEYS_FILE(함수 비밀값 .env 경로)
import { createClient } from '@supabase/supabase-js'

const keysFile = Deno.env.get('SEED_KEYS_FILE') ?? 'supabase/functions/.env'
for (const line of (await Deno.readTextFile(keysFile)).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) Deno.env.set(m[1], m[2])
}
if (Deno.env.get('SEORAP_ENV') === 'production') throw new Error('seed is not allowed in production')

const { encrypt, hmac, phoneHash, randomToken } = await import('../supabase/functions/_shared/crypto.ts')
const { last4, maskName } = await import('../supabase/functions/_shared/core/phone.ts')

const db = createClient(Deno.env.get('SEED_SUPABASE_URL')!, Deno.env.get('SEED_SERVICE_ROLE_KEY')!, {
  db: { schema: 'app' }, auth: { persistSession: false },
})
const must = <T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data as NonNullable<T>
}

export const tokenFor = (s: string) => ('seed' + s).padEnd(32, '0')

type TestUnit = { testItemId: string; testName: string; count: number }
type Unit = { launched?: string; forward?: { name: string; phone: string; opened?: boolean }; cancel?: 'checking' | 'cancelled'; lock?: string[]; issue?: 'issued' | 'failed' }

async function recipient(name: string, phone: string, firstAt: string, lastAt: string) {
  const r = must(await db.from('recipients').insert({
    phone_enc: await encrypt('A', phone), phone_hash: await phoneHash(phone), phone_last4: last4(phone),
    name_enc: await encrypt('A', name), name_masked: maskName(name), first_order_at: firstAt, last_order_at: lastAt,
  }).select('id').single(), 'recipient')
  return r.id as string
}

async function boxLink(recipientId: string, scenario: string) {
  must(await db.from('access_links').insert({ token_hash: await hmac(`box:${tokenFor(scenario)}`), link_type: 'box', recipient_id: recipientId }), 'box link')
}

async function order(o: {
  recipientId: string; orderNo: string; paidAt: string; productName: string; optionName: string; amount: number;
  tests: TestUnit[]; units: Unit[]; counsel?: boolean; ordererName?: string; recipientName: string
}) {
  const ord = must(await db.from('orders').insert({
    source: 'naver_api', external_order_id: o.orderNo, recipient_id: o.recipientId, paid_at: o.paidAt, ordered_at: o.paidAt,
    recipient_name_enc: await encrypt('A', o.recipientName), recipient_name_masked: maskName(o.recipientName),
    orderer_name_enc: o.ordererName ? await encrypt('A', o.ordererName) : null,
    orderer_name_masked: o.ordererName ? maskName(o.ordererName) : null,
    orderer_differs: !!o.ordererName,
  }).select('id').single(), 'order')
  const mapping = must(await db.from('product_mappings').insert({ key_type: 'product_option', naver_product_id: `NP-${o.orderNo}`, option_code: 'OPT-1', includes_counsel: !!o.counsel }).select('id').single(), 'mapping')
  for (const tu of o.tests) {
    must(await db.from('product_mapping_items').insert({ mapping_id: mapping.id, psy_item_id: tu.testItemId, test_name: tu.testName, count_per_unit: tu.count }), 'mapping item')
  }
  const expected = o.tests.reduce((a, b) => a + b.count, 0)
  const anyFailed = o.units.some((u) => u.issue === 'failed')
  const item = must(await db.from('order_items').insert({
    order_id: ord.id, naver_product_order_id: `${o.orderNo}-1`, naver_product_id: `NP-${o.orderNo}`, option_code: 'OPT-1',
    product_name: o.productName, option_name: o.optionName, quantity: 1, payment_amount: o.amount, mapping_id: mapping.id,
    process_status: anyFailed ? 'issue_failed' : 'dispatched', dispatch_status: anyFailed ? 'none' : 'done',
  }).select('id').single(), 'order item')
  const iss = must(await db.from('code_issuances').insert({
    order_item_id: item.id, idempotency_key: `${o.orderNo}-1`, expected_count: expected,
    issued_count: anyFailed ? 0 : expected, status: anyFailed ? 'failed' : 'succeeded',
  }).select('id').single(), 'issuance')

  let i = 0
  const ids: string[] = []
  for (const tu of o.tests) {
    for (let unitNo = 1; unitNo <= tu.count; unitNo++) {
      const u = o.units[i] ?? {}
      const code = `TEST-${o.orderNo.slice(-4)}-${String(i + 1).padStart(4, '0')}`
      const failed = u.issue === 'failed'
      const v = must(await db.from('vouchers').insert({
        order_item_id: item.id, order_id: ord.id, issuance_id: iss.id, test_item_id: tu.testItemId, test_name: tu.testName, unit_no: unitNo,
        code_enc: failed ? null : await encrypt('B', code), code_hash: failed ? null : await hmac(`code:${code}`),
        issue_status: failed ? 'failed' : 'issued', amount: Math.floor(o.amount / expected),
        first_launched_at: u.launched ?? null, last_launched_at: u.launched ?? null, launched_by: u.launched ? 'recipient' : null,
        first_code_exposed_at: u.launched ?? null,
        cancel_status: u.cancel ?? 'none', lock_reasons: u.lock ?? (o.counsel ? ['counsel_pending'] : []),
      }).select('id').single(), 'voucher')
      ids.push(v.id)
      if (u.forward) await forward(v.id, u.forward)
      i++
    }
  }
  return { orderId: ord.id as string, voucherIds: ids }
}

async function forward(voucherId: string, f: { name: string; phone: string; opened?: boolean }) {
  const r = must(await db.rpc('forward_apply', {
    p_action: 'forward', p_voucher_id: voucherId, p_client_request_id: crypto.randomUUID(), p_actor_type: 'recipient',
    p_token_hash: await hmac(`forward:${randomToken()}`), p_link_ttl_days: 180,
    p_to_name_enc: await encrypt('A', f.name), p_to_name_masked: maskName(f.name),
    p_to_phone_enc: await encrypt('A', f.phone), p_to_phone_hash: await phoneHash(f.phone), p_to_phone_last4: last4(f.phone), p_is_self: false,
  }), 'forward') as { out_forward_id: string; out_message_id: string; out_access_link_id: string }[]
  const now = new Date().toISOString()
  must(await db.from('messages').update({ final_status: 'delivered', final_media: 'alimtalk', accepted_at: now, final_at: now }).eq('id', r[0].out_message_id), 'msg')
  if (f.opened) must(await db.from('access_links').update({ first_opened_at: now }).eq('id', r[0].out_access_link_id), 'opened')
  return r[0]
}

const STS_INFANT = { testItemId: 'PSY-STS-INFANT', testName: 'STS 영유아 기질검사', count: 1 }
const STS_ADULT2 = { testItemId: 'PSY-STS-ADULT', testName: 'STS 성인 기질검사', count: 2 }

// S1 공구 온가족 3매
const r1 = await recipient('홍길동', '01012345678', '2026-09-30T01:00:00Z', '2026-10-22T01:00:00Z')
await boxLink(r1, 'S1')
await order({
  recipientId: r1, recipientName: '홍길동', orderNo: '2026102200001', paidAt: '2026-10-22T01:00:00Z',
  productName: '온가족 기질검사 패키지', optionName: '영아용(12~35개월) / 온가족 기질검사 패키지(영유아1+성인용2)', amount: 21500,
  tests: [STS_INFANT, STS_ADULT2],
  units: [{ launched: '2026-10-22T03:00:00Z' }, {}, { forward: { name: '김영희', phone: '01022223333', opened: true } }],
})

console.log('seed done')
