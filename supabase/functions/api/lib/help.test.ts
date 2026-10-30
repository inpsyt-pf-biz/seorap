import { assertEquals } from '@std/assert'
import { loadHelpWith, resetHelpCacheForTest } from './help.ts'

const settings = { contact_line: '기본 문의' }
const raw = { items: [{ id: 'a', question: '질문', answer_md: '답', buttons: [] }], contact_md: '[톡톡](https://talk.naver.com/x)' }

Deno.test('어드민 내용을 그대로 돌려주고 1분 동안 다시 부르지 않는다', async () => {
  resetHelpCacheForTest()
  let calls = 0
  const fetchRaw = async () => { calls++; return raw }
  const a = await loadHelpWith(settings, fetchRaw, 0)
  const b = await loadHelpWith(settings, fetchRaw, 59_000)
  assertEquals(a.items[0].question, '질문')
  assertEquals(b.contact, '[톡톡](https://talk.naver.com/x)')
  assertEquals(calls, 1)
  await loadHelpWith(settings, fetchRaw, 61_000)
  assertEquals(calls, 2)
})

Deno.test('어드민 장애·null 이면 기본 문구 5개 + 설정값 문의처 (실패는 15초만 기억)', async () => {
  resetHelpCacheForTest()
  const failed = await loadHelpWith(settings, async () => { throw new Error('down') }, 0)
  assertEquals(failed.items.length, 5)
  assertEquals(failed.contact, '기본 문의')
  const empty = await loadHelpWith(settings, async () => null, 20_000)
  assertEquals(empty.items.length, 5)
  const back = await loadHelpWith(settings, async () => raw, 40_000)
  assertEquals(back.items.length, 1)
})

// 최종 검토 ②: 어드민 DB 가 멈추거나 계속 실패해도 받는 분 화면·도움말이 기다리거나 매번 다시 부르지 않는다
Deno.test('어드민이 응답하지 않으면 정한 시간 안에 기본 문구로', async () => {
  resetHelpCacheForTest()
  const started = Date.now()
  const r = await loadHelpWith(settings, () => new Promise(() => {}), 0, 50)
  assertEquals(r.items.length, 5)
  assertEquals(Date.now() - started < 1000, true)
})

Deno.test('실패한 뒤 15초 동안은 다시 부르지 않고 기본 문구, 그 뒤에는 다시 부른다', async () => {
  resetHelpCacheForTest()
  let calls = 0
  const failing = async () => { calls++; throw new Error('down') }
  await loadHelpWith(settings, failing, 0)
  await loadHelpWith(settings, failing, 14_000)
  assertEquals(calls, 1)
  const back = await loadHelpWith(settings, async () => raw, 16_000)
  assertEquals(back.items.length, 1)
})
