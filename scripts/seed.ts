// 시드 시나리오 (로컬·미리보기 전용). 실행 전 supabase db reset 으로 비운다.
// 필요 환경변수: SEED_SUPABASE_URL, SEED_SECRET_KEY, SEED_KEYS_FILE(함수 비밀값 .env 경로)
import { createClient } from '@supabase/supabase-js'

// 대상이 운영 프로젝트면 키 파일과 상관없이 멈춘다 (키 파일의 SEORAP_ENV 만으로는 대상 주소를 막지 못한다)
const PROD_REF = 'huthfuxytygdbytxrdhf'
if ((Deno.env.get('SEED_SUPABASE_URL') ?? '').includes(PROD_REF)) throw new Error('seed refuses to run against the production project')

const keysFile = Deno.env.get('SEED_KEYS_FILE') ?? 'supabase/functions/.env'
for (const line of (await Deno.readTextFile(keysFile)).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) Deno.env.set(m[1], m[2])
}
// 허용 목록: 읽어 들인 SEORAP_ENV 가 local·preview 일 때만 시드한다 (비었거나 오타면 중단)
const { isDevEnv } = await import('../supabase/functions/_shared/env.ts')
if (!isDevEnv()) throw new Error('seed is only allowed when SEORAP_ENV is local or preview')

const { encrypt, hmac, phoneHash, randomToken } = await import('../supabase/functions/_shared/crypto.ts')
const { last4, maskName } = await import('../supabase/functions/_shared/core/phone.ts')

const db = createClient(Deno.env.get('SEED_SUPABASE_URL')!, Deno.env.get('SEED_SECRET_KEY')!, {
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
  // 스토어 관리코드. 상담 어드민의 상품 연결이 이 값으로 신청서 템플릿을 고른다 (B2)
  manageCode?: string
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
    // 상품주문번호는 실제처럼 숫자만 (상담 원장이 숫자만 받는다)
    order_id: ord.id, naver_product_order_id: `${o.orderNo}01`, naver_product_id: `NP-${o.orderNo}`, option_code: 'OPT-1',
    manage_code: o.manageCode ?? null,
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

const GOLDEN1 = { testItemId: 'PSY-GOLDEN', testName: 'GOLDEN 성격유형검사', count: 1 }
const GOLDEN2 = { ...GOLDEN1, count: 2 }
const STS_ADULT1 = { ...STS_ADULT2, count: 1 }

// S3 두 번 구매 (S1과 같은 번호 → 같은 서랍)
await order({
  recipientId: r1, recipientName: '홍길동', orderNo: '2026093000004', paidAt: '2026-09-30T01:00:00Z',
  productName: 'GOLDEN 성격유형검사', optionName: '2매', amount: 50000, tests: [GOLDEN2],
  units: [{ launched: '2026-10-01T02:00:00Z' }, { launched: '2026-10-02T02:00:00Z' }],
})

// S2 검사 + 상담 (STS 커플상담 패키지: 커플 둘이 STS 성인 기질검사 1매씩 + 커플상담 1회)
const r2 = await recipient('김철수', '01055556666', '2026-10-22T02:00:00Z', '2026-10-22T02:00:00Z')
await boxLink(r2, 'S2')
await order({
  recipientId: r2, recipientName: '김철수', orderNo: '2026102200002', paidAt: '2026-10-22T02:00:00Z',
  productName: 'STS 커플상담 패키지', optionName: '커플상담 1회 + STS 성인 기질검사 2매', amount: 150000,
  tests: [STS_ADULT2], units: [{}, {}], counsel: true, manageCode: 'STS-CPL-S',
})

// S4 선물 주문 (구매자 ≠ 수취인)
const r4 = await recipient('성춘향', '01033334444', '2026-10-22T03:00:00Z', '2026-10-22T03:00:00Z')
await boxLink(r4, 'S4')
await order({
  recipientId: r4, recipientName: '성춘향', ordererName: '이몽룡', orderNo: '2026102200005', paidAt: '2026-10-22T03:00:00Z',
  productName: 'STS 성인 기질검사', optionName: '1매', amount: 12000, tests: [STS_ADULT1], units: [{}],
})

// S5 부분 취소
const r5 = await recipient('박영희', '01077778888', '2026-10-22T04:00:00Z', '2026-10-22T04:00:00Z')
await boxLink(r5, 'S5')
await order({
  recipientId: r5, recipientName: '박영희', orderNo: '2026102200006', paidAt: '2026-10-22T04:00:00Z',
  productName: '온가족 기질검사 패키지', optionName: '유아용(36~72개월) / 온가족', amount: 21500,
  tests: [STS_INFANT, STS_ADULT2], units: [{ cancel: 'cancelled' }, { cancel: 'checking' }, {}],
})

// S6 하루 여러 주문 (같은 날 5건)
const r6 = await recipient('최민수', '01099990000', '2026-10-22T05:00:00Z', '2026-10-22T09:00:00Z')
await boxLink(r6, 'S6')
const S6_ORDERS = ['2026102200007', '2026102200008', '2026102200009', '2026102200010', '2026102200011']
for (let n = 0; n < S6_ORDERS.length; n++) {
  await order({
    recipientId: r6, recipientName: '최민수', orderNo: S6_ORDERS[n], paidAt: `2026-10-22T0${5 + n}:00:00Z`,
    productName: 'STS 성인 기질검사', optionName: '1매', amount: 12000, tests: [STS_ADULT1], units: [{}],
  })
}

// S7 코드 발급 실패
const r7 = await recipient('정다은', '01024681357', '2026-10-22T06:00:00Z', '2026-10-22T06:00:00Z')
await boxLink(r7, 'S7')
await order({
  recipientId: r7, recipientName: '정다은', orderNo: '2026102200012', paidAt: '2026-10-22T06:00:00Z',
  productName: 'STS 성인 기질검사', optionName: '1매', amount: 12000, tests: [STS_ADULT1], units: [{ issue: 'failed' }],
})

// S8 전달 → 전달 취소 → 다른 번호로 전달
const r8 = await recipient('한지민', '01013572468', '2026-10-22T07:00:00Z', '2026-10-22T07:00:00Z')
await boxLink(r8, 'S8')
const s8 = await order({
  recipientId: r8, recipientName: '한지민', orderNo: '2026102200013', paidAt: '2026-10-22T07:00:00Z',
  productName: 'GOLDEN 성격유형검사', optionName: '1매', amount: 25000, tests: [GOLDEN1], units: [{}],
})
await forward(s8.voucherIds[0], { name: '이순신', phone: '01011112222' })
must(await db.rpc('forward_apply', {
  p_action: 'cancel', p_voucher_id: s8.voucherIds[0], p_client_request_id: crypto.randomUUID(), p_actor_type: 'recipient',
  p_token_hash: await hmac(`forward:${randomToken()}`), p_link_ttl_days: 180,
}), 'cancel')
await forward(s8.voucherIds[0], { name: '유관순', phone: '01033335555' })

// S9 동시 요청 시험용 (검사 6매): 1번째는 전달 1번(오늘 치 1건)이 이미 있고, 나머지 5개는 전달 전
const r9 = await recipient('강감찬', '01086429753', '2026-10-22T08:00:00Z', '2026-10-22T08:00:00Z')
await boxLink(r9, 'S9')
const s9 = await order({
  recipientId: r9, recipientName: '강감찬', orderNo: '2026102200014', paidAt: '2026-10-22T08:00:00Z',
  productName: 'GOLDEN 성격유형검사', optionName: '6매', amount: 150000, tests: [{ ...GOLDEN1, count: 6 }], units: [{}, {}, {}, {}, {}, {}],
})
await forward(s9.voucherIds[0], { name: '장보고', phone: '01044445555' })

// SR 받는 분 화면 시험용 (검사 12매, 모두 전달 전). 테스트가 한 매씩 새로 전달해 받는 분 링크를 연다
// (S10 은 토큰이 0 으로 채워져 S1 과 같아지므로 쓰지 않는다)
const r10 = await recipient('윤봉길', '01020202020', '2026-10-22T09:00:00Z', '2026-10-22T09:00:00Z')
await boxLink(r10, 'SR')
await order({
  recipientId: r10, recipientName: '윤봉길', orderNo: '2026102200015', paidAt: '2026-10-22T09:00:00Z',
  productName: 'GOLDEN 성격유형검사', optionName: '12매', amount: 300000, tests: [{ ...GOLDEN1, count: 12 }], units: Array.from({ length: 12 }, () => ({})),
})

// SC 상담 원장 전달 실패 시험용 (가짜 원장이 MOCK-FAIL 넘기기를 거부한다)
const r11 = await recipient('안중근', '01030303030', '2026-10-22T10:00:00Z', '2026-10-22T10:00:00Z')
await boxLink(r11, 'SC')
await order({
  recipientId: r11, recipientName: '안중근', orderNo: '2026102200016', paidAt: '2026-10-22T10:00:00Z',
  productName: 'GOLDEN 커플 상담 패키지', optionName: '커플 상담 1회 + GOLDEN 1매', amount: 120000,
  tests: [GOLDEN1], units: [{}], counsel: true, manageCode: 'MOCK-FAIL',
})

// 검수용 추가 서랍 (미리보기에서 여러 사람이 각자 S2 와 같은 흐름을 해 보게). 공개 저장소에 실제 이름을 두지 않도록
// 이름 목록은 저장소 밖 JSON 파일(SEED_EXTRA_FILE, ["이름", ...])로 받는다. 서랍 토큰은 T1·T2… , 번호는 010-7000-000N
const extraFile = Deno.env.get('SEED_EXTRA_FILE')
if (extraFile) {
  const names = JSON.parse(await Deno.readTextFile(extraFile)) as string[]
  if (names.length > 9) throw new Error('추가 서랍은 9개까지 (토큰 T10 은 T1 과 겹친다)')
  for (const [i, name] of names.entries()) {
    const n = i + 1
    const r = await recipient(name, `0107000000${n}`, '2026-10-29T01:00:00Z', '2026-10-29T01:00:00Z')
    await boxLink(r, `T${n}`)
    await order({
      // 가짜 검사 코드가 주문번호 끝 4자리를 쓰므로 9001~ 로 잡아 위 시나리오(0001~0016)와 겹치지 않게
      recipientId: r, recipientName: name, orderNo: `202610290${9000 + n}`, paidAt: '2026-10-29T01:00:00Z',
      productName: 'STS 커플상담 패키지', optionName: '커플상담 1회 + STS 성인 기질검사 2매', amount: 150000,
      tests: [STS_ADULT2], units: [{}, {}], counsel: true, manageCode: 'STS-CPL-S',
    })
  }
  console.log(`추가 서랍 ${names.length}개 (T1~T${names.length})`)
}

console.log('seed done')
