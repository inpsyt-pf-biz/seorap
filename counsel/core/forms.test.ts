import { assertEquals } from '@std/assert'
import { checkDefinition } from '../../supabase/functions/_shared/core/counselForm.ts'
import { MANAGE_CODE_RE, moveField, newField, nextFieldId, nextRowId, parseSlot, slotText, tidyDefinition } from './forms.ts'

Deno.test('nextFieldId: 지운 자리를 다시 쓰지 않고 겹치지 않는 id', () => {
  assertEquals(nextFieldId([]), 'f1')
  assertEquals(nextFieldId([{ id: 'f1', type: 'short', label: '' }, { id: 'f3', type: 'short', label: '' }]), 'f4')
  assertEquals(nextFieldId([{ id: 'f2', type: 'short', label: '' }]), 'f3')
})

Deno.test('newField: 유형마다 필요한 기본값', () => {
  assertEquals(newField('single', []).options, [])
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

Deno.test('tidyDefinition: 가능 시간대의 빈 줄·빈 선택지·빈 문구를 정리한다', () => {
  const def = tidyDefinition({
    intro: '',
    fields: [{
      id: 'f1', type: 'availability', label: '시간',
      availability: {
        days: [{ id: 'weekday', label: ' 평일 ' }, { id: 'd1', label: ' ' }],
        slots: [{ id: 'morning', label: '오전', hours: ' 9~12시 ' }, { id: 's1', label: '', hours: '' }],
        askStartDate: false, methods: ['방문', ' ', ' 전화 '], contactTimes: [' '],
        labels: { pick: ' ', method: ' 희망하는 상담 형태 ' },
      },
    }],
  })
  assertEquals(def.fields[0].availability, {
    days: [{ id: 'weekday', label: '평일' }], slots: [{ id: 'morning', label: '오전', hours: '9~12시' }],
    askStartDate: false, methods: ['방문', '전화'], contactTimes: [], labels: { method: '희망하는 상담 형태' },
  })
  assertEquals(checkDefinition(def), [])
})

Deno.test('tidyDefinition: 가능 시간대 문구를 모두 비우면 labels 를 남기지 않는다', () => {
  const def = tidyDefinition({
    intro: '',
    fields: [{ id: 'f1', type: 'availability', label: '시간', availability: { ...newField('availability', []).availability!, labels: { start: ' ' } } }],
  })
  assertEquals('labels' in def.fields[0].availability!, false)
})

Deno.test('nextRowId: 요일·시간대 줄에 겹치지 않는 id', () => {
  assertEquals(nextRowId('d', [{ id: 'weekday' }, { id: 'sat' }]), 'd1')
  assertEquals(nextRowId('d', [{ id: 'weekday' }, { id: 'd1' }]), 'd2')
})

Deno.test('parseSlot·slotText: 시간대 배지는 "이름 시간" 한 칸으로 쓰고 읽는다', () => {
  assertEquals(parseSlot(' 오전  9~12시 '), { label: '오전', hours: '9~12시' })
  assertEquals(parseSlot('점심'), { label: '점심', hours: '' })
  assertEquals(parseSlot('저녁 18시 이후'), { label: '저녁', hours: '18시 이후' })
  assertEquals(slotText({ label: '오전', hours: '9~12시' }), '오전 9~12시')
  assertEquals(slotText({ label: '점심', hours: '' }), '점심')
})

Deno.test('MANAGE_CODE_RE: 영문·숫자·-·_ 20자', () => {
  assertEquals(['STS-CPL-S', 'G_ADU', 'A'.repeat(20)].map((c) => MANAGE_CODE_RE.test(c)), [true, true, true])
  assertEquals(['한글', '', 'A'.repeat(21), 'A B'].map((c) => MANAGE_CODE_RE.test(c)), [false, false, false, false])
})
