import { assertEquals } from '@std/assert'
import { contactOk, defaultHelp, helpItemProblems, isAllowedUrl, normalizeHelp, parseHelpMarkdown } from './helpContent.ts'

Deno.test('isAllowedUrl: https 와 tel 만', () => {
  assertEquals(isAllowedUrl('https://talk.naver.com/ct/w4abcd'), true)
  assertEquals(isAllowedUrl('tel:1588-0000'), true)
  assertEquals(isAllowedUrl('http://a.com'), false)
  assertEquals(isAllowedUrl('javascript:alert(1)'), false)
  assertEquals(isAllowedUrl('https://a.com/x y'), false)
  assertEquals(isAllowedUrl('https://' + 'a'.repeat(500)), false)
})

Deno.test('helpItemProblems: 글자 수·버튼 규칙', () => {
  const ok = { question: '문자가 안 와요', answerMd: '스팸함을 보세요', buttons: [{ label: '톡톡 문의', url: 'https://talk.naver.com/x' }] }
  assertEquals(helpItemProblems(ok), [])
  assertEquals(helpItemProblems({ ...ok, question: ' ' }), ['question'])
  assertEquals(helpItemProblems({ ...ok, question: '가'.repeat(81) }), ['question'])
  assertEquals(helpItemProblems({ ...ok, answerMd: '' }), ['answer'])
  assertEquals(helpItemProblems({ ...ok, answerMd: '가'.repeat(2001) }), ['answer'])
  assertEquals(helpItemProblems({ ...ok, buttons: [ok.buttons[0], ok.buttons[0], ok.buttons[0]] }), ['buttons'])
  assertEquals(helpItemProblems({ ...ok, buttons: [{ label: '', url: 'https://a.com' }] }), ['buttonLabel'])
  assertEquals(helpItemProblems({ ...ok, buttons: [{ label: '열기', url: 'http://a.com' }] }), ['buttonUrl'])
})

Deno.test('contactOk: 0~300자', () => {
  assertEquals(contactOk(''), true)
  assertEquals(contactOk('가'.repeat(300)), true)
  assertEquals(contactOk('가'.repeat(301)), false)
})

Deno.test('parseHelpMarkdown: 문단·줄바꿈·굵게·기울임', () => {
  assertEquals(parseHelpMarkdown('첫 줄\n**둘째** 줄\n\n*셋째*'), [
    { kind: 'p', children: [{ kind: 'text', text: '첫 줄' }, { kind: 'br' }, { kind: 'strong', children: [{ kind: 'text', text: '둘째' }] }, { kind: 'text', text: ' 줄' }] },
    { kind: 'p', children: [{ kind: 'em', children: [{ kind: 'text', text: '셋째' }] }] },
  ])
})

Deno.test('parseHelpMarkdown: 글머리·번호 목록', () => {
  assertEquals(parseHelpMarkdown('- 하나\n- **둘**'), [
    { kind: 'ul', items: [[{ kind: 'text', text: '하나' }], [{ kind: 'strong', children: [{ kind: 'text', text: '둘' }] }]] },
  ])
  assertEquals(parseHelpMarkdown('1. 가\n2. 나'), [{ kind: 'ol', items: [[{ kind: 'text', text: '가' }], [{ kind: 'text', text: '나' }]] }])
})

Deno.test('parseHelpMarkdown: 허용 주소만 링크, 나머지는 글자 그대로', () => {
  assertEquals(parseHelpMarkdown('[톡톡](https://talk.naver.com/x)'), [
    { kind: 'p', children: [{ kind: 'link', href: 'https://talk.naver.com/x', children: [{ kind: 'text', text: '톡톡' }] }] },
  ])
  assertEquals(parseHelpMarkdown('[누르기](javascript:alert(1))'), [{ kind: 'p', children: [{ kind: 'text', text: '[누르기](javascript:alert(1))' }] }])
})

// Review Focus 1·2: 짝 없는 기호, 주소 안 괄호·공백
Deno.test('parseHelpMarkdown: 짝 없는 별표와 이상한 주소는 글자 그대로', () => {
  assertEquals(parseHelpMarkdown('**굵게'), [{ kind: 'p', children: [{ kind: 'text', text: '**굵게' }] }])
  assertEquals(parseHelpMarkdown('[a](https://a.com/x y)'), [{ kind: 'p', children: [{ kind: 'text', text: '[a](https://a.com/x y)' }] }])
  assertEquals(parseHelpMarkdown('<script>x</script>'), [{ kind: 'p', children: [{ kind: 'text', text: '<script>x</script>' }] }])
})

Deno.test('defaultHelp: 지금 문구 5개와 받은 문의처', () => {
  const d = defaultHelp('문의: 톡톡')
  assertEquals(d.items.length, 5)
  assertEquals(d.items[0].question, '문자가 안 와요')
  assertEquals(d.items.every((i) => i.buttons.length === 0), true)
  assertEquals(d.contact, '문의: 톡톡')
})

// Review Focus 3·4
Deno.test('normalizeHelp: 규칙 어긴 항목만 빼고, 모양이 틀리면 null, 0개는 그대로 0개', () => {
  const raw = {
    items: [
      { id: 'a', question: '좋은 질문', answer_md: '답', buttons: [] },
      { id: 'b', question: '', answer_md: '답', buttons: [] },
      { id: 'c', question: '버튼 이상', answer_md: '답', buttons: 'x' },
    ],
    contact_md: '문의',
  }
  assertEquals(normalizeHelp(raw, '기본'), { items: [{ id: 'a', question: '좋은 질문', answerMd: '답', buttons: [] }], contact: '문의' })
  assertEquals(normalizeHelp({ items: [], contact_md: '' }, '기본'), { items: [], contact: '' })
  assertEquals(normalizeHelp({ items: [], contact_md: '가'.repeat(301) }, '기본')?.contact, '기본')
  assertEquals(normalizeHelp(null, '기본'), null)
  assertEquals(normalizeHelp({ items: 'x' }, '기본'), null)
})
