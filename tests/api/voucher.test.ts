import { assert, assertEquals } from '@std/assert'
import { adminDb, fastOtp, login } from './helpers.ts'

await fastOtp()
const lines = async (c: Awaited<ReturnType<typeof login>>) => (await c.call('box')).body.groups.flatMap((g: any) => g.lines)

Deno.test('실시하기: 플랫폼 주소를 주고 실시 기록을 남긴다', async () => {
  const c = await login('S4', '4444')
  const line = (await lines(c)).find((l: any) => l.status.actions.includes('launch'))
  const r = await c.call('voucher/launch', { voucherId: line.voucherId })
  assertEquals(r.status, 200)
  assert(r.body.url.startsWith('https://inpsyt.co.kr/inpsyt/testing/TEST-'))
  const after = (await lines(c)).find((l: any) => l.voucherId === line.voucherId)
  assert(after.status.label.startsWith('실시함'))
  assertEquals(after.status.actions, ['continue'])
})

Deno.test('코드 보기: 코드를 주고 노출 시각을 남긴다', async () => {
  const c = await login('S6', '0000')
  const line = (await lines(c)).find((l: any) => l.status.actions.includes('launch'))
  const r = await c.call('voucher/code', { voucherId: line.voucherId })
  assert(r.body.code.startsWith('TEST-'))
  const { data } = await adminDb().from('vouchers').select('first_code_exposed_at').eq('id', line.voucherId).single()
  assert(data!.first_code_exposed_at)
})

Deno.test('전달된 줄은 실시할 수 없다', async () => {
  const c = await login('S1', '5678')
  const fwd = (await lines(c)).find((l: any) => l.status.label.startsWith('전달함'))
  const r = await c.call('voucher/launch', { voucherId: fwd.voucherId })
  assertEquals(r.status, 409)
})

Deno.test('남의 것과 없는 것은 똑같이 NOT_OWNER (not_owner_and_unknown_look_same)', async () => {
  const mine = await login('S1', '5678')
  const other = await login('S4', '4444')
  const someoneElse = (await lines(other))[0].voucherId
  const a = await mine.call('voucher/code', { voucherId: someoneElse })
  const b = await mine.call('voucher/code', { voucherId: '00000000-0000-0000-0000-000000000000' })
  const c = await mine.call('voucher/code', { voucherId: '-'.repeat(36) })
  assertEquals([a.status, a.body.error.code], [403, 'NOT_OWNER'])
  assertEquals([b.status, b.body.error.code], [403, 'NOT_OWNER'])
  assertEquals([c.status, c.body.error.code], [403, 'NOT_OWNER'])
})
