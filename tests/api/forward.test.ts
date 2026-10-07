import { assert, assertEquals, assertNotEquals } from '@std/assert'
import { adminDb, fastOtp, forwardTokenHash, login } from './helpers.ts'

await fastOtp()
const lines = async (c: Awaited<ReturnType<typeof login>>) => (await c.call('box')).body.groups.flatMap((g: any) => g.lines)
const rid = () => crypto.randomUUID()

// 발송권의 현재 전달 링크 (받는 분에게 간 링크)
async function liveLink(voucherId: string) {
  const { data: v } = await adminDb().from('vouchers').select('current_forward_id').eq('id', voucherId).single()
  const { data: f } = await adminDb().from('voucher_forwards').select('access_link_id').eq('id', v!.current_forward_id).single()
  const { data: link } = await adminDb().from('access_links').select('id, code_exposed_at').eq('id', f!.access_link_id).single()
  return link!
}

Deno.test('전달: 이름·번호로 보내면 이력 1줄과 받는 분 링크', async () => {
  const c = await login('S1', '5678')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  const r = await c.call('forward/create', { voucherId: target.voucherId, name: '이몽룡', phone: '010 9876 5432', clientRequestId: rid() })
  assertEquals(r.status, 200)
  assertEquals(r.body.created, true)
  const after = (await lines(c)).find((l: any) => l.voucherId === target.voucherId)
  assertEquals(after.status.label, '전달함 · 이몽룡')
  assertEquals(after.forwardTo.phone, '010-9876-5432')
  const hist = (await c.call('history')).body.items
  assertEquals(hist[0].toName, '이몽룡')
  assertEquals(hist[0].result, 'delivered_alimtalk')
  const { data: box } = await adminDb().from('dev_outbox').select('body').eq('kind', 'alimtalk').eq('to_phone_last4', '5432').order('created_at', { ascending: false }).limit(1).single()
  assert(/\/f\/[A-Za-z0-9]{32}/.test(box!.body))
})

Deno.test('전달: 같은 요청 ID는 한 번만 처리 (연타)', async () => {
  const c = await login('S6', '0000')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  const id = rid()
  const body = { voucherId: target.voucherId, name: '홍길동', phone: '01022224444', clientRequestId: id }
  const [a, b] = await Promise.all([c.call('forward/create', body), c.call('forward/create', body)])
  assertEquals([a.status, b.status], [200, 200])
  assertEquals(a.body.forwardId, b.body.forwardId)
  const { count } = await adminDb().from('voucher_forwards').select('id', { count: 'exact', head: true }).eq('client_request_id', id)
  assertEquals(count, 1)
})

Deno.test('전달: 잘못된 번호·이름은 VALIDATION', async () => {
  const c = await login('S6', '0000')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  assertEquals((await c.call('forward/create', { voucherId: target.voucherId, name: '이몽룡', phone: '02-123-4567', clientRequestId: rid() })).body.error.extra.field, 'phone')
  assertEquals((await c.call('forward/create', { voucherId: target.voucherId, name: '', phone: '01011112222', clientRequestId: rid() })).body.error.extra.field, 'name')
})

Deno.test('전달: 본인 번호는 확인을 요구한다', async () => {
  const c = await login('S6', '0000')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  const r = await c.call('forward/create', { voucherId: target.voucherId, name: '나', phone: '01099990000', clientRequestId: rid() })
  assertEquals([r.status, r.body.error.extra.reason], [409, 'self_number'])
  const ok = await c.call('forward/create', { voucherId: target.voucherId, name: '나', phone: '01099990000', clientRequestId: rid(), confirmSelf: true })
  assertEquals(ok.status, 200)
})

Deno.test('같은 번호로 10분 안에 다시 보내면 LIMIT_EXCEEDED', async () => {
  const c = await login('S6', '0000')
  const free = (await lines(c)).filter((l: any) => l.status.actions.includes('forward'))
  await c.call('forward/create', { voucherId: free[0].voucherId, name: '동생', phone: '01077770000', clientRequestId: rid() })
  const r = await c.call('forward/create', { voucherId: free[1].voucherId, name: '동생', phone: '01077770000', clientRequestId: rid() })
  assertEquals([r.status, r.body.error.code, r.body.error.extra.reason], [429, 'LIMIT_EXCEEDED', 'same_number_gap'])
  // 다시 시도할 수 있는 시각이 미래의 ISO 시각으로 온다
  const retryAt = r.body.error.extra.retryAt
  assertEquals(new Date(retryAt).toISOString(), retryAt)
  assert(Date.parse(retryAt) > Date.now())
})

Deno.test('전달: 다른 발송권에 같은 요청 ID를 쓰면 앞 전달을 돌려주지 않는다', async () => {
  const c = await login('S6', '0000')
  const free = (await lines(c)).filter((l: any) => l.status.actions.includes('forward'))
  assert(free.length >= 2, 'S6 에 전달할 수 있는 줄이 2개 이상 남아 있어야 한다')
  const [a, b] = free
  const id = rid()
  const first = await c.call('forward/create', { voucherId: a.voucherId, name: '사촌', phone: '01066660001', clientRequestId: id })
  assertEquals([first.status, first.body.created], [200, true])
  // 같은 요청 ID, 다른 발송권, 다른 번호(같은 번호 간격에 걸리지 않게)
  const second = await c.call('forward/create', { voucherId: b.voucherId, name: '이모', phone: '01066660002', clientRequestId: id })
  assertNotEquals(second.status, 200)
  assertEquals(second.body.forwardId, undefined)
  const after = (await lines(c)).find((l: any) => l.voucherId === b.voucherId)
  assert(after.status.actions.includes('forward'))
  const { count } = await adminDb().from('voucher_forwards').select('id', { count: 'exact', head: true }).eq('voucher_id', b.voucherId)
  assertEquals(count, 0)
})

Deno.test('다른 분께: 코드 노출 전에는 취소, 노출 후에는 거부', async () => {
  const c = await login('S1', '5678')
  const fwd = (await lines(c)).find((l: any) => l.status.actions.includes('reforward'))
  // 받는 분이 코드를 봤다고 표시
  const { data: v } = await adminDb().from('vouchers').select('current_forward_id').eq('id', fwd.voucherId).single()
  const { data: f } = await adminDb().from('voucher_forwards').select('access_link_id').eq('id', v!.current_forward_id).single()
  await adminDb().from('access_links').update({ code_exposed_at: new Date().toISOString() }).eq('id', f!.access_link_id)
  const blocked = await c.call('forward/cancel', { voucherId: fwd.voucherId, clientRequestId: rid() })
  assertEquals([blocked.status, blocked.body.error.extra.reason], [409, 'code_exposed'])
  await adminDb().from('access_links').update({ code_exposed_at: null }).eq('id', f!.access_link_id)
  const ok = await c.call('forward/cancel', { voucherId: fwd.voucherId, clientRequestId: rid() })
  assertEquals(ok.status, 200)
  const after = (await lines(c)).find((l: any) => l.voucherId === fwd.voucherId)
  assertEquals(after.status.actions, ['launch', 'forward'])
  const { data: link } = await adminDb().from('access_links').select('revoked_reason').eq('id', f!.access_link_id).single()
  assertEquals(link!.revoked_reason, 'forward_cancelled')
})

Deno.test('다시 보내기: 새 링크, 옛 링크는 resent로 닫힘', async () => {
  const c = await login('S8', '2468')
  const fwd = (await lines(c))[0]
  const old = await liveLink(fwd.voucherId)
  const r = await c.call('forward/resend', { voucherId: fwd.voucherId, clientRequestId: rid() })
  assertEquals(r.status, 200)
  const items = (await c.call('history')).body.items
  assertEquals(items[0].action, 'resend')
  assertEquals(items[0].toName, '유관순')
  // 옛 링크는 "다시 보냄"으로 닫히고, 새 링크가 현재 링크가 된다
  const { data: closed } = await adminDb().from('access_links').select('revoked_reason').eq('id', old.id).single()
  assertEquals(closed!.revoked_reason, 'resent')
  assertNotEquals((await liveLink(fwd.voucherId)).id, old.id)
})

Deno.test('다시 보내기: 같은 요청 ID 연타는 한 번만 처리', async () => {
  const c = await login('S6', '0000')
  const fwd = (await lines(c)).find((l: any) => l.status.actions.includes('resend'))
  const id = rid()
  const body = { voucherId: fwd.voucherId, clientRequestId: id }
  const [a, b] = await Promise.all([c.call('forward/resend', body), c.call('forward/resend', body)])
  assertEquals([a.status, b.status], [200, 200])
  assertEquals(a.body.forwardId, b.body.forwardId)
  const { count } = await adminDb().from('voucher_forwards').select('id', { count: 'exact', head: true }).eq('client_request_id', id)
  assertEquals(count, 1)
})

// S8 은 시드에서 이미 전달 2번이 오늘 치로 잡혀 있어(한도 하루 3번) 위 다시 보내기로 한도가 찬다. 전달 1번뿐인 S6 줄로 확인한다.
Deno.test('다시 보내기 뒤에도 코드 노출 기록이 남아 다른 분께가 거부된다', async () => {
  const c = await login('S6', '0000')
  const fwd = (await lines(c)).find((l: any) => l.status.actions.includes('resend'))
  const old = await liveLink(fwd.voucherId)
  await adminDb().from('access_links').update({ code_exposed_at: new Date().toISOString() }).eq('id', old.id)
  const resent = await c.call('forward/resend', { voucherId: fwd.voucherId, clientRequestId: rid() })
  assertEquals(resent.status, 200)
  const now = await liveLink(fwd.voucherId)
  assertNotEquals(now.id, old.id)
  assert(now.code_exposed_at, '새 링크가 코드 노출 기록을 이어받아야 한다')
  const r = await c.call('forward/cancel', { voucherId: fwd.voucherId, clientRequestId: rid() })
  assertEquals([r.status, r.body.error.extra.reason], [409, 'code_exposed'])
})

Deno.test('직접 공유: 복사할 문구에 받는 분 링크, 이력은 받는 분 미확인', async () => {
  const c = await login('S5', '8888')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  const r = await c.call('forward/direct', { voucherId: target.voucherId, clientRequestId: rid() })
  assertEquals(r.status, 200)
  assert(/\/f\/[A-Za-z0-9]{32}$/.test(r.body.url))
  assertEquals(r.body.text.includes('심리검사'), true)
  assertEquals(r.body.text.includes('STS'), false)
  assertEquals((await c.call('history')).body.items[0].action, 'direct_share')
})

// 아래 세 시험은 동시 요청을 다루므로 S9(검사 5매, 1번째 줄은 전달 1번이 오늘 치로 있음)만 쓴다.
const todaysSends = async (voucherId: string) => {
  const { count } = await adminDb().from('voucher_forwards').select('id', { count: 'exact', head: true }).eq('voucher_id', voucherId).in('action', ['forward', 'resend'])
  return count ?? 0
}

Deno.test('다시 보내기: 동시에 여러 번 보내도 하루 한도를 넘지 않는다', async () => {
  const c = await login('S9', '9753')
  const fwd = (await lines(c)).find((l: any) => l.status.actions.includes('resend'))
  const before = await todaysSends(fwd.voucherId)
  const room = 3 - before // 기본 한도: 발송권 하나에 하루 3번(전달 + 다시 보내기)
  assert(room >= 1 && room < 4, `남은 횟수 ${room}`)
  const rs = await Promise.all(Array.from({ length: 4 }, () => c.call('forward/resend', { voucherId: fwd.voucherId, clientRequestId: rid() })))
  assertEquals(rs.filter((r) => r.status === 200).length, room)
  for (const r of rs.filter((r) => r.status !== 200)) assertEquals([r.status, r.body.error.code], [429, 'LIMIT_EXCEEDED'])
  assert((await todaysSends(fwd.voucherId)) <= 3)
})

// 200 으로 준 직접 공유 주소의 토큰은 실제로 열리는 링크여야 한다 (되풀이 응답은 토큰 원문을 모르므로 새로 만들어 주면 죽은 링크가 된다)
const linkIsLive = async (voucherId: string, url: string) => {
  const { count } = await adminDb().from('access_links').select('id', { count: 'exact', head: true })
    .eq('token_hash', await forwardTokenHash(url.split('/f/')[1])).eq('voucher_id', voucherId).is('revoked_at', null)
  return count === 1
}

Deno.test('직접 공유: 앞서 쓴 요청 ID로 다시 부르면 죽은 링크를 주지 않고 거절한다', async () => {
  const c = await login('S9', '9753')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  const used = rid()
  // 이 발송권에 요청 ID 를 한 번 쓰고(전달), 전달을 취소해 다시 전달할 수 있게 만든다
  assertEquals((await c.call('forward/create', { voucherId: target.voucherId, name: '임시', phone: '01050020001', clientRequestId: used })).status, 200)
  assertEquals((await c.call('forward/cancel', { voucherId: target.voucherId, clientRequestId: rid() })).status, 200)
  const linksBefore = (await adminDb().from('access_links').select('id', { count: 'exact', head: true }).eq('voucher_id', target.voucherId)).count
  // 같은 요청 ID 의 앞 결과가 이 발송권에 있어 함수는 되풀이 응답을 준다. 이때 200 + 새 주소를 주면 그 주소는 어디에도 없다.
  const r = await c.call('forward/direct', { voucherId: target.voucherId, clientRequestId: used })
  assertEquals([r.status, r.body.error?.extra?.reason], [409, 'not_forwardable'])
  assertEquals(r.body.url, undefined)
  assertEquals((await adminDb().from('access_links').select('id', { count: 'exact', head: true }).eq('voucher_id', target.voucherId)).count, linksBefore)
})

Deno.test('직접 공유: 같은 요청 ID를 동시에 보내면 열리는 링크는 하나뿐', async () => {
  const c = await login('S9', '9753')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  const id = rid()
  const rs = await Promise.all(Array.from({ length: 4 }, () => c.call('forward/direct', { voucherId: target.voucherId, clientRequestId: id })))
  const ok = rs.filter((r) => r.status === 200)
  assertEquals(ok.length, 1)
  for (const r of rs.filter((r) => r.status !== 200)) assertEquals([r.status, r.body.error.extra.reason], [409, 'not_forwardable'])
  for (const r of ok) assert(await linkIsLive(target.voucherId, r.body.url), '200 으로 준 주소가 열리는 링크여야 한다')
})

Deno.test('실시 기록 함수는 전달 중인 발송권을 바꾸지 않고 false 를 돌려준다', async () => {
  const c = await login('S9', '9753')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  assertEquals((await c.call('forward/create', { voucherId: target.voucherId, name: '임시', phone: '01050020002', clientRequestId: rid() })).status, 200)
  for (const launch of [true, false]) {
    const { data, error } = await adminDb().rpc('voucher_mark_exposed', { p_voucher_id: target.voucherId, p_launch: launch })
    assertEquals([error, data], [null, false])
  }
  const { data: v } = await adminDb().from('vouchers').select('first_launched_at, first_code_exposed_at').eq('id', target.voucherId).single()
  assertEquals([v!.first_launched_at, v!.first_code_exposed_at], [null, null])
  // 전달을 취소해 다음 시험이 이 줄을 쓸 수 있게 되돌린다
  assertEquals((await c.call('forward/cancel', { voucherId: target.voucherId, clientRequestId: rid() })).status, 200)
})

Deno.test('실시하기와 전달하기가 동시에 와도 한쪽만 된다 (한 발송권이 두 사람에게 가지 않는다)', async () => {
  const c = await login('S9', '9753')
  for (let i = 0; i < 3; i++) {
    const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
    assert(target, 'S9 에 전달 전인 줄이 남아 있어야 한다')
    const [launch, fwd] = await Promise.all([
      c.call('voucher/launch', { voucherId: target.voucherId }),
      c.call('forward/create', { voucherId: target.voucherId, name: '동시', phone: `0105001000${i}`, clientRequestId: rid() }),
    ])
    assertEquals([launch.status, fwd.status].filter((s) => s === 200).length, 1)
    if (launch.status !== 200) assertEquals(launch.body.url, undefined) // 진 쪽은 코드가 든 주소를 받지 못한다
    const { data: v } = await adminDb().from('vouchers').select('first_launched_at, current_forward_id').eq('id', target.voucherId).single()
    assert(!(v!.first_launched_at && v!.current_forward_id), '실시 기록과 전달이 함께 있으면 안 된다')
  }
})

// 취소 신청이 거절된 줄은 그대로 쓸 수 있는 줄이다 (lineStatus 가 전달하기를 내어 주므로 DB 도 받아야 한다)
Deno.test('취소가 거절된 줄도 전달할 수 있다', async () => {
  const c = await login('S9', '9753')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  assert(target, 'S9 에 전달 전인 줄이 남아 있어야 한다')
  const { error } = await adminDb().from('vouchers').update({ cancel_status: 'rejected' }).eq('id', target.voucherId)
  assertEquals(error, null)
  const shown = (await lines(c)).find((l: any) => l.voucherId === target.voucherId)
  assert(shown.status.actions.includes('forward'))
  const r = await c.call('forward/create', { voucherId: target.voucherId, name: '거절', phone: '01050030001', clientRequestId: rid() })
  assertEquals([r.status, r.body.created], [200, true])
})
