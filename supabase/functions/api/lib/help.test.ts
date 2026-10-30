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

Deno.test('어드민 장애·null 이면 기본 문구 5개 + 설정값 문의처 (기억하지 않는다)', async () => {
  resetHelpCacheForTest()
  const failed = await loadHelpWith(settings, async () => { throw new Error('down') }, 0)
  assertEquals(failed.items.length, 5)
  assertEquals(failed.contact, '기본 문의')
  const empty = await loadHelpWith(settings, async () => null, 1_000)
  assertEquals(empty.items.length, 5)
  const back = await loadHelpWith(settings, async () => raw, 2_000)
  assertEquals(back.items.length, 1)
})
