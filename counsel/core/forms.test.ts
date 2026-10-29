import { assertEquals } from '@std/assert'
import { checkDefinition } from '../../supabase/functions/_shared/core/counselForm.ts'
import { MANAGE_CODE_RE, moveField, newField, nextFieldId, tidyDefinition } from './forms.ts'

Deno.test('nextFieldId: 지운 자리를 다시 쓰지 않고 겹치지 않는 id', () => {
  assertEquals(nextFieldId([]), 'f1')
  assertEquals(nextFieldId([{ id: 'f1', type: 'short', label: '' }, { id: 'f3', type: 'short', label: '' }]), 'f4')
  assertEquals(nextFieldId([{ id: 'f2', type: 'short', label: '' }]), 'f3')
})

Deno.test('newField: 유형마다 필요한 기본값', () => {
  assertEquals(newField('single', []).options, ['', ''])
  assertEquals(newField('availability', []).availability?.days.length, 3)
  assertEquals(newField('consent', []).consentKind, 'third_party')
  assertEquals(newField('short', []).required, undefined)
})

Deno.test('moveField: 위아래로 한 칸, 끝에서는 그대로', () => {
  const fs = ['a', 'b', 'c'].map((id) => ({ id, type: 'short' as const, label: id }))
  assertEquals(moveField(fs, 1, -1).map((f) => f.id), ['b', 'a', 'c'])
  assertEquals(moveField(fs, 2, 1).map((f) => f.id), ['a', 'b', 'c'])
})

Deno.test('tidyDefinition: 빈 선택지를 빼고 공백을 지운 뒤에는 검사를 통과한다', () => {
  const def = tidyDefinition({
    intro: ' 안내 ',
    fields: [{ id: 'f1', type: 'single', label: ' 결혼 예정 ', options: ['예', ' ', '아니오 '] }],
  })
  assertEquals(def, { intro: '안내', fields: [{ id: 'f1', type: 'single', label: '결혼 예정', options: ['예', '아니오'] }] })
  assertEquals(checkDefinition(def), [])
})

Deno.test('MANAGE_CODE_RE: 영문·숫자·-·_ 20자', () => {
  assertEquals(['STS-CPL-S', 'G_ADU', 'A'.repeat(20)].map((c) => MANAGE_CODE_RE.test(c)), [true, true, true])
  assertEquals(['한글', '', 'A'.repeat(21), 'A B'].map((c) => MANAGE_CODE_RE.test(c)), [false, false, false, false])
})
