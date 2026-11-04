import { assert, assertEquals } from '@std/assert'
import { adminDb, Client, fastOtp, login, tokenFor } from './helpers.ts'

await fastOtp()

type Buyer = Awaited<ReturnType<typeof login>>
const rid = () => crypto.randomUUID()
const box = async (c: Buyer) => (await c.call('box')).body
const orderIdOf = async (c: Buyer) => (await box(c)).counsel[0].orderId as string
const OK = {
  c1: true, c2: false, name: '홍길동', nick: '길동이',
  when: { cells: ['weekday|evening', 'sat|morning'], method: '화상' },
}

Deno.test('상담: 원장 전달이 실패하면 잠금을 풀지 않고 제출 기록도 없다 (SC)', async () => {
  const c = await login('SC', '3030')
  const orderId = await orderIdOf(c)
  const form = (await c.call('counsel/form', { orderId })).body
  const r = await c.call('counsel/submit', { orderId, templateId: form.templateId, version: form.version, answers: OK, clientRequestId: rid() })
  assertEquals([r.status, r.body.error?.code], [502, 'UPSTREAM_FAILED'])
  const lines = (await box(c)).groups.flatMap((g: any) => g.lines)
  assert(lines.every((l: any) => l.status.disabled?.includes('launch')))
  const { count } = await adminDb().from('counsel_submissions').select('order_id', { count: 'exact', head: true }).eq('order_id', orderId)
  assertEquals(count, 0)
})

Deno.test('상담: 서랍에 상담 카드, 신청서는 상품에 연결된 템플릿의 판으로', async () => {
  const c = await login('S2', '6666')
  const b = await box(c)
  assertEquals(b.counsel.length, 1)
  assertEquals([b.counsel[0].productName, b.counsel[0].submitted], ['STS 커플상담 패키지', false])
  const r = await c.call('counsel/form', { orderId: b.counsel[0].orderId })
  assertEquals(r.status, 200, JSON.stringify(r.body))
  assertEquals([r.body.version, r.body.definition.intro], [1, '가짜 신청서'])
  // 제3자 제공 동의 아래에서 볼 "제공받는 업체 정보" (상담 어드민의 운영 중인 협력센터)
  assertEquals(r.body.providers, [{ name: '가짜 상담센터', phone: '02-000-0000', address: '서울시 가짜구 1' }])
  assertEquals(b.counsel[0].booking, null)
  // 상담이 없는 서랍에는 카드가 없다
  assertEquals((await box(await login('S1', '5678'))).counsel, [])
})

Deno.test('상담: 남의 주문·상담 없는 주문은 열 수 없다', async () => {
  const s2 = await login('S2', '6666')
  const s2Order = await orderIdOf(s2)
  const s1 = await login('S1', '5678')
  assertEquals((await s1.call('counsel/form', { orderId: s2Order })).body.error?.code, 'NOT_OWNER')
  const s1Order = (await box(s1)).groups[0].orderId
  const r = await s1.call('counsel/form', { orderId: s1Order })
  assertEquals([r.body.error?.code, r.body.error?.extra?.reason], ['CONFLICT', 'no_counsel'])
})

Deno.test('상담: 인증한 지 오래된 세션은 신청서를 열 수 없다 (REAUTH_REQUIRED)', async () => {
  const c = await login('S2', '6666')
  const orderId = await orderIdOf(c)
  // 방금 만든(가장 최근) 세션을 1시간 전에 만든 것으로
  const { data } = await adminDb().from('customer_sessions').select('id_hash, created_at').order('created_at', { ascending: false }).limit(1).single()
  await adminDb().from('customer_sessions').update({ created_at: new Date(Date.now() - 3_600_000).toISOString() }).eq('id_hash', data!.id_hash)
  const r = await c.call('counsel/form', { orderId })
  assertEquals([r.status, r.body.error?.code], [401, 'REAUTH_REQUIRED'])
})

Deno.test('상담: 필수 답이 비거나 판이 바뀌었으면 거부', async () => {
  const c = await login('S2', '6666')
  const orderId = await orderIdOf(c)
  const form = (await c.call('counsel/form', { orderId })).body
  const bad = await c.call('counsel/submit', { orderId, templateId: form.templateId, version: form.version, answers: { ...OK, c1: false, name: '' }, clientRequestId: rid() })
  assertEquals([bad.status, bad.body.error?.code, bad.body.error?.extra?.problems], [422, 'VALIDATION', { c1: 'required', name: 'required' }])
  const old = await c.call('counsel/submit', { orderId, templateId: form.templateId, version: 0, answers: OK, clientRequestId: rid() })
  assertEquals([old.body.error?.code, old.body.error?.extra?.reason], ['CONFLICT', 'form_changed'])
  const sensitive = await c.call('counsel/submit', { orderId, templateId: form.templateId, version: form.version, answers: { ...OK, drug: '수면제' }, clientRequestId: rid() })
  assertEquals(sensitive.body.error?.extra?.problems, { drug: 'consent_needed' })
})

Deno.test('상담: 제출해도 검사는 잠겨 있고 카드는 연락 대기, 다시 내도 한 번만', async () => {
  const c = await login('S2', '6666')
  const orderId = await orderIdOf(c)
  const form = (await c.call('counsel/form', { orderId })).body
  const before = (await box(c)).groups.flatMap((g: any) => g.lines)
  assert(before.every((l: any) => l.status.disabled?.includes('launch')))
  const body = { orderId, templateId: form.templateId, version: form.version, answers: OK, clientRequestId: rid() }
  const r = await c.call('counsel/submit', body)
  assertEquals(r.status, 200, JSON.stringify(r.body))
  const after = await box(c)
  // 예약 확정 전이라 검사는 아직 잠겨 있다 (시나리오 §5-1)
  assert(after.groups.flatMap((g: any) => g.lines).every((l: any) => l.status.disabled?.includes('launch')))
  assertEquals([after.counsel[0].submitted, after.counsel[0].testsOpen, after.counsel[0].booking], [true, false, { state: 'waiting', scheduledAt: null, centerName: null }])
  const again = await c.call('counsel/submit', { ...body, clientRequestId: rid() })
  assertEquals([again.status, again.body.submitted], [200, true])
  const { data } = await adminDb().from('counsel_submissions').select('template_version, unlocked_at').eq('order_id', orderId)
  assertEquals(data, [{ template_version: 1, unlocked_at: null }])
  // 서랍 DB 에는 답 원문이 남지 않는다
  const { data: ev } = await adminDb().from('events').select('*').order('created_at', { ascending: false }).limit(20)
  assert(!JSON.stringify(ev).includes('홍길동') && !JSON.stringify(data).includes('홍길동'))
  // 이미 낸 주문은 신청서를 다시 열지 않는다
  const reopen = await c.call('counsel/form', { orderId })
  assertEquals([reopen.body.error?.code, reopen.body.error?.extra?.reason], ['CONFLICT', 'already_submitted'])
})

// 시험용 가짜 상담 통로는 이 구매 건 ID 들을 "예약 확정" · "상담 어드민 연결 실패" 로 돌려준다 (_shared/adapters/mock.ts)
const CONFIRMED = '00000000-0000-4000-8000-0000000c0f1d'
const UNREACHABLE = '00000000-0000-4000-8000-00000000dead'
const pointTo = async (orderId: string, purchaseId: string) =>
  await adminDb().from('counsel_submissions').update({ counsel_purchase_id: purchaseId }).eq('order_id', orderId)

Deno.test('상담: 센터가 예약을 확정하면 서랍을 열 때 검사가 열리고, 그 뒤 예약이 취소돼도 열린 채로 둔다 (E4)', async () => {
  const c = await login('S2', '6666')
  const orderId = await orderIdOf(c)
  const form = (await c.call('counsel/form', { orderId })).body
  await c.call('counsel/submit', { orderId, templateId: form.templateId, version: form.version, answers: OK, clientRequestId: rid() })
  const keep = (await adminDb().from('counsel_submissions').select('counsel_purchase_id').eq('order_id', orderId).single()).data!.counsel_purchase_id

  // 상담 어드민에 닿지 못하면 잠금을 그대로 두고, 서랍은 정상으로 열린다
  await pointTo(orderId, UNREACHABLE)
  const down = await c.call('box')
  assertEquals(down.status, 200)
  assert(down.body.groups.flatMap((g: any) => g.lines).every((l: any) => l.status.disabled?.includes('launch')))
  assertEquals(down.body.counsel[0].booking.state, 'waiting')

  await pointTo(orderId, CONFIRMED)
  const open = await box(c)
  assert(open.groups.flatMap((g: any) => g.lines).every((l: any) => l.status.actions.includes('launch')))
  assertEquals([open.counsel[0].testsOpen, open.counsel[0].booking], [true, { state: 'confirmed', scheduledAt: '2026-11-26T05:00:00Z', centerName: '가짜 상담센터' }])
  const { data } = await adminDb().from('counsel_submissions').select('unlocked_at').eq('order_id', orderId).single()
  assert(data!.unlocked_at)

  // 예약이 취소돼 다시 대기가 돼도 이미 열린 검사는 닫지 않는다
  await pointTo(orderId, keep)
  const later = await box(c)
  assert(later.groups.flatMap((g: any) => g.lines).every((l: any) => l.status.actions.includes('launch')))
  assertEquals([later.counsel[0].testsOpen, later.counsel[0].booking.state], [true, 'waiting'])
})

Deno.test('상담: 세션 없이 부르면 SESSION_EXPIRED', async () => {
  const r = await new Client().call('counsel/form', { orderId: rid() })
  assertEquals(r.body.error?.code, 'SESSION_EXPIRED')
  assert(tokenFor('S2'))
})
