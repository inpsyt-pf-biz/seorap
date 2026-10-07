import { assert, assertEquals } from '@std/assert'
import { adminDb, Client, fastOtp, login } from './helpers.ts'

await fastOtp()

Deno.test('서랍: S1 온가족 패키지가 3줄, 같은 검사 2매는 1·2번째', async () => {
  const c = await login('S1', '5678')
  const r = await c.call('box')
  assertEquals(r.status, 200)
  assertEquals(r.body.ownerName, '홍길동')
  const g = r.body.groups.find((x: any) => x.productName === '온가족 기질검사 패키지')
  assertEquals(g.lines.length, 3)
  const adult = g.lines.filter((l: any) => l.testName === 'STS 성인 기질검사')
  assertEquals(adult.map((l: any) => [l.unitNo, l.unitsOfTest]), [[1, 2], [2, 2]])
  assertEquals(g.lines[0].status.label.startsWith('실시함'), true)
  assertEquals(adult[0].status.actions, ['launch', 'forward'])
  assertEquals(adult[1].status.label, '전달함 · 김영희')
  assertEquals(adult[1].forwardTo, { name: '김영희', phone: '010-2222-3333' })
})

Deno.test('서랍: 응답 어디에도 코드 원문이 없다', async () => {
  const c = await login('S1', '5678')
  const text = JSON.stringify((await c.call('box')).body)
  assertEquals(text.includes('TEST-'), false)
  assertEquals(text.includes('v1.'), false)
})

Deno.test('서랍: S3 두 번 구매가 구매일 최신순, 다 쓴 묶음은 done', async () => {
  const c = await login('S1', '5678')
  const groups = (await c.call('box')).body.groups
  assertEquals(groups.length, 2)
  assert(groups[0].purchasedAt > groups[1].purchasedAt)
  assertEquals(groups[1].done, true)
})

Deno.test('서랍: S2 상담 주문은 잠김, S5 취소 줄, S7 준비 중', async () => {
  const s2 = (await (await login('S2', '6666')).call('box')).body.groups[0].lines
  assertEquals(s2[0].status.actions, ['counsel_form'])
  const s5 = (await (await login('S5', '8888')).call('box')).body.groups[0].lines.map((l: any) => l.status.label)
  assertEquals(s5.includes('취소됨'), true)
  assertEquals(s5.includes('취소 확인 중'), true)
  const s7 = (await (await login('S7', '1357')).call('box')).body.groups[0].lines[0]
  assertEquals(s7.status.label, '준비 중')
})

Deno.test('세션이 끝나면 401 SESSION_EXPIRED (expired_session_returns_401)', async () => {
  const c = await login('S1', '5678')
  await adminDb().from('customer_sessions').update({ idle_expires_at: '2020-01-01T00:00:00Z' }).neq('id_hash', '')
  const r = await c.call('box')
  assertEquals(r.status, 401)
  assertEquals(r.body.error.code, 'SESSION_EXPIRED')
})

Deno.test('쿠키 없이 부르면 401', async () => {
  assertEquals((await new Client().call('box')).status, 401)
})

Deno.test('전달 이력: S8은 전달·취소·전달 3줄, 최신순', async () => {
  const c = await login('S8', '2468')
  const items = (await c.call('history')).body.items
  assertEquals(items.map((i: any) => i.action), ['forward', 'cancel', 'forward'])
  assertEquals(items[0].toName, '유관순')
  assertEquals(items[0].result, 'delivered_alimtalk')
})
