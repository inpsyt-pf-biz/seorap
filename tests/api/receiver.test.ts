import { assert, assertEquals } from '@std/assert'
import { adminDb, Client, fastOtp, login } from './helpers.ts'

await fastOtp()

type Buyer = Awaited<ReturnType<typeof login>>
const lines = async (c: Buyer) => (await c.call('box')).body.groups.flatMap((g: any) => g.lines)
const rid = () => crypto.randomUUID()
const lineOf = async (c: Buyer, voucherId: string) => (await lines(c)).find((l: any) => l.voucherId === voucherId)

// SR(12매)에서 한 매씩 새로 전달한다. 받는 분 번호는 끝 4자리를 달리해, 가짜 발신함에서 방금 보낸 링크만 꺼낸다
// (같은 번호 10분 간격 한도에 걸리지 않게, 실행마다 시작 번호를 바꾼다)
let seq = 1000 + Math.floor(Math.random() * 8000)
async function forwardFresh(): Promise<{ buyer: Buyer; voucherId: string; token: string }> {
  const buyer = await login('SR', '2020')
  const target = (await lines(buyer)).find((l: any) => l.status.actions.includes('forward'))
  assert(target, '전달할 수 있는 줄이 없다 (SR, db:reset 필요)')
  const last4 = String(++seq)
  const r = await buyer.call('forward/create', { voucherId: target.voucherId, name: '이몽룡', phone: `0109876${last4}`, clientRequestId: rid() })
  assertEquals(r.status, 200, JSON.stringify(r.body))
  const { data } = await adminDb().from('dev_outbox').select('body').eq('kind', 'alimtalk').eq('to_phone_last4', last4)
    .order('created_at', { ascending: false }).limit(1).single()
  const token = data!.body.match(/\/f\/([A-Za-z0-9]{32})/)![1]
  return { buyer, voucherId: target.voucherId, token }
}
const link = async (voucherId: string) => {
  const { data: v } = await adminDb().from('vouchers').select('current_forward_id, first_launched_at').eq('id', voucherId).single()
  const { data: f } = await adminDb().from('voucher_forwards').select('access_link_id').eq('id', v!.current_forward_id).single()
  const { data: l } = await adminDb().from('access_links')
    .select('first_opened_at, code_exposed_at, first_launched_at').eq('id', f!.access_link_id).single()
  return { ...l!, voucherLaunchedAt: v!.first_launched_at }
}

Deno.test('받는 분: 화면 정보는 보낸 분(가린 이름)·검사명뿐이고, 여는 것만으로는 아무것도 기록하지 않는다', async () => {
  const { voucherId, token } = await forwardFresh()
  const r = await new Client().call('forward/page', { token })
  assertEquals(r.status, 200, JSON.stringify(r.body))
  assertEquals(r.body.senderName, '윤*길')
  assertEquals(r.body.testName, 'GOLDEN 성격유형검사')
  assertEquals(r.body.launched, false)
  // 보낸 분 번호, 코드, 같은 주문의 다른 검사는 응답에 없다
  const raw = JSON.stringify(r.body)
  assert(!raw.includes('2020'), raw)
  assertEquals(Object.keys(r.body).sort(), ['contact', 'launched', 'senderName', 'testName'])
  const l = await link(voucherId)
  assertEquals([l.first_opened_at, l.code_exposed_at, l.first_launched_at], [null, null, null])
})

Deno.test('받는 분: [실시하기]를 누르면 열어 봄·실시·코드 노출을 링크에 남기고 검사 주소를 준다', async () => {
  const { buyer, voucherId, token } = await forwardFresh()
  const r = await new Client().call('forward/launch', { token })
  assertEquals(r.status, 200, JSON.stringify(r.body))
  assert(/^https?:\/\/.+\/[^/]+$/.test(r.body.url), r.body.url)
  const l = await link(voucherId)
  assert(l.first_opened_at && l.code_exposed_at && l.first_launched_at)
  // 구매자 쪽 발송권은 "실시함"이 되지 않는다 (구매자가 이어서 할 수 없는 줄)
  assertEquals(l.voucherLaunchedAt, null)
  const after = await lineOf(buyer, voucherId)
  assertEquals(after.status.note, '받는 분이 열어 봄')
  assertEquals(after.status.actions, ['resend'])
  // 다시 열면 이어서 하기
  assertEquals((await new Client().call('forward/page', { token })).body.launched, true)
})

Deno.test('받는 분: [코드 보기]는 코드를 주고, 구매자 쪽 [다른 분께]가 사라진다', async () => {
  const { buyer, voucherId, token } = await forwardFresh()
  const before = await lineOf(buyer, voucherId)
  assert(before.status.actions.includes('reforward'))
  assertEquals(before.status.note, '아직 안 열어 봄')
  const r = await new Client().call('forward/code', { token })
  assertEquals(r.status, 200, JSON.stringify(r.body))
  assert(typeof r.body.code === 'string' && r.body.code.length > 0)
  const after = await lineOf(buyer, voucherId)
  assertEquals(after.status.actions, ['resend'])
  assertEquals(after.status.note, '받는 분이 열어 봄')
  assertEquals((await link(voucherId)).first_launched_at, null)
})

Deno.test('받는 분: 구매자가 다른 분께 보내면 처음 링크는 사유와 함께 막힌다', async () => {
  const { buyer, voucherId, token } = await forwardFresh()
  const c = await buyer.call('forward/cancel', { voucherId, clientRequestId: rid() })
  assertEquals(c.status, 200, JSON.stringify(c.body))
  for (const path of ['forward/page', 'forward/launch', 'forward/code']) {
    const r = await new Client().call(path, { token })
    assertEquals([r.status, r.body.error?.code, r.body.error?.extra?.reason], [410, 'LINK_REVOKED', 'forward_cancelled'], path)
    // 오류 응답에 검사 코드·주소가 실려 나가지 않는다
    assertEquals([r.body.code, r.body.url], [undefined, undefined], path)
  }
})

Deno.test('받는 분: 검사가 취소되면 voucher_cancelled, 만료되면 expired', async () => {
  const a = await forwardFresh()
  await adminDb().from('vouchers').update({ cancel_status: 'cancelled' }).eq('id', a.voucherId)
  const r1 = await new Client().call('forward/launch', { token: a.token })
  assertEquals([r1.status, r1.body.error?.extra?.reason], [410, 'voucher_cancelled'])
  assertEquals((await new Client().call('forward/page', { token: a.token })).body.error?.extra?.reason, 'voucher_cancelled')

  const b = await forwardFresh()
  const { data: v } = await adminDb().from('vouchers').select('current_forward_id').eq('id', b.voucherId).single()
  const { data: f } = await adminDb().from('voucher_forwards').select('access_link_id').eq('id', v!.current_forward_id).single()
  await adminDb().from('access_links').update({ expires_at: '2026-01-01T00:00:00Z' }).eq('id', f!.access_link_id)
  const r2 = await new Client().call('forward/code', { token: b.token })
  assertEquals([r2.status, r2.body.error?.extra?.reason], [410, 'expired'])
})

Deno.test('받는 분: 틀린 토큰·서랍 토큰은 LINK_INVALID', async () => {
  for (const token of ['short', 'x'.repeat(32), ('seed' + 'S6').padEnd(32, '0')]) {
    const r = await new Client().call('forward/page', { token })
    assertEquals([r.status, r.body.error?.code], [404, 'LINK_INVALID'], token)
  }
})

Deno.test('받는 분: 전달 취소와 실시가 동시에 와도 취소된 링크로 코드가 나가지 않는다', async () => {
  for (let i = 0; i < 3; i++) {
    const { buyer, voucherId, token } = await forwardFresh()
    const [cancel, launch] = await Promise.all([
      buyer.call('forward/cancel', { voucherId, clientRequestId: rid() }),
      new Client().call('forward/launch', { token }),
    ])
    // 둘 중 하나만 이긴다: 실시가 이기면 코드가 노출돼 취소가 거절되고, 취소가 이기면 실시가 막힌다
    const launched = launch.status === 200
    const cancelled = cancel.status === 200
    assert(launched !== cancelled, `launch ${launch.status} cancel ${cancel.status} ${JSON.stringify(cancel.body)}`)
    if (cancelled) assertEquals(launch.body.error?.code, 'LINK_REVOKED')
  }
})
