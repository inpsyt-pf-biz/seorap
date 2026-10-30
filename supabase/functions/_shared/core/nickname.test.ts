import { assertEquals } from '@std/assert'
import { checkNickname, NICKNAME_MAX } from './nickname.ts'

// 닉네임: 검사를 전달할 때 받는 분에게 보이는 이름 (설정 화면). 알림톡 변수로도 들어가므로 글자를 좁게 받는다
Deno.test('닉네임: 한글·영문·숫자·띄어쓰기로 12자까지', () => {
  assertEquals(NICKNAME_MAX, 12)
  assertEquals(checkNickname('홍길동'), null)
  assertEquals(checkNickname('Mom 1'), null)
  assertEquals(checkNickname('가'.repeat(12)), null)
})

Deno.test('닉네임: 비었거나 길거나 다른 글자면 거절', () => {
  assertEquals(checkNickname('   '), 'empty')
  assertEquals(checkNickname('가'.repeat(13)), 'too_long')
  assertEquals(checkNickname('홍길동!'), 'chars')
  assertEquals(checkNickname('<b>'), 'chars')
  assertEquals(checkNickname(3 as unknown), 'chars')
})
