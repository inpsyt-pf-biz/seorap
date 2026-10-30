import { assertEquals } from '@std/assert'
import { insertLink, prefixLines, wrapSelection } from './markdownEdit.ts'

Deno.test('wrapSelection: 고른 글자를 감싸고 그 글자를 계속 고른 상태로', () => {
  assertEquals(wrapSelection('스팸함을 보세요', 0, 3, '**'), { text: '**스팸함**을 보세요', selStart: 2, selEnd: 5 })
  assertEquals(wrapSelection('가나', 1, 1, '*'), { text: '가**나', selStart: 2, selEnd: 2 })
})

Deno.test('prefixLines: 고른 줄마다 목록 기호, 번호는 1부터', () => {
  assertEquals(prefixLines('하나\n둘', 0, 4, 'ul').text, '- 하나\n- 둘')
  assertEquals(prefixLines('하나\n둘', 0, 4, 'ol').text, '1. 하나\n2. 둘')
  assertEquals(prefixLines('앞\n하나\n뒤', 2, 3, 'ul').text, '앞\n- 하나\n뒤')
})

Deno.test('insertLink: 고른 글자를 링크 문구로, 없으면 "링크"', () => {
  assertEquals(insertLink('톡톡 문의', 0, 2, 'https://talk.naver.com/x').text, '[톡톡](https://talk.naver.com/x) 문의')
  assertEquals(insertLink('', 0, 0, 'tel:1588-0000').text, '[링크](tel:1588-0000)')
})
