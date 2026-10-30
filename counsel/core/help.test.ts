import { assertEquals } from '@std/assert'
import { editorText, reorderIds } from './help.ts'

Deno.test('reorderIds: 끌어 놓은 자리로 옮기고, 같은 자리·모르는 id 면 그대로(같은 배열)', () => {
  const ids = ['a', 'b', 'c', 'd']
  assertEquals(reorderIds(ids, 'a', 'c'), ['b', 'c', 'a', 'd'])
  assertEquals(reorderIds(ids, 'd', 'b'), ['a', 'd', 'b', 'c'])
  assertEquals(reorderIds(ids, 'b', 'b') === ids, true)
  assertEquals(reorderIds(ids, 'x', 'b') === ids, true)
})

Deno.test('editorText: 쓰는 단추·링크 창은 한국어, 모르는 키는 기본 문구(끼워 넣기 값 채움)', () => {
  assertEquals(editorText('toolbar.bold', 'Bold'), '굵게')
  assertEquals(editorText('toolbar.removeBold', 'Remove bold'), '굵게')
  assertEquals(editorText('toolbar.bulletedList', 'Bulleted list'), '글머리 목록')
  assertEquals(editorText('toolbar.toggleGroup', 'toggle group'), '목록 종류')
  assertEquals(editorText('createLink.url', 'URL'), '주소 (https:// 또는 tel:)')
  assertEquals(editorText('toolbar.redo', 'Redo {{shortcut}}', { shortcut: 'Ctrl+Y' }), '다시 하기')
  assertEquals(editorText('toolbar.table', 'Insert {{what}}', { what: 'table' }), 'Insert table')
})
