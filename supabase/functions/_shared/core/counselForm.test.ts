import { assertEquals } from '@std/assert'
import {
  type FormDefinition, checkDefinition, checkAnswers, splitAnswers, summarizeAvailability, DEFAULT_AVAILABILITY,
} from './counselForm.ts'

const DEF: FormDefinition = {
  intro: '원활한 상담 진행을 위해 아래 문답에 답해 주세요.',
  fields: [
    { id: 'c1', type: 'consent', label: '개인정보 제3자 제공 동의', help: '제공받는 자: 상담센터', required: true, consentKind: 'third_party' },
    // 민감정보는 따로 받는 선택 동의 (01-plan §0 10-07). 동의해야 민감정보 문항에 답할 수 있다
    { id: 'c2', type: 'consent', label: '민감정보 수집·이용 동의(선택)', consentKind: 'sensitive' },
    { id: 'n1', type: 'notice', label: '제공받는 업체 정보', help: '업체명: 상담센터' },
    { id: 's1', type: 'section', label: '상담 신청서 작성 안내' },
    { id: 'name', type: 'short', label: '성함', required: true, mapsTo: 'client_name' },
    { id: 'nick', type: 'short', label: '닉네임', required: true },
    { id: 'birth', type: 'date', label: '생년월일', required: true, mapsTo: 'client_birth' },
    { id: 'wed', type: 'single', label: '결혼 예정이신가요?', required: true, options: ['결혼 예정입니다.', '아닙니다.'] },
    { id: 'exp', type: 'multi', label: '심리상담 경험', options: ['있음', '없음'], mapsTo: 'counseling_experience' },
    { id: 'drug', type: 'long', label: '복용 약물·진단', sensitive: true, mapsTo: 'medication_diagnosis' },
    { id: 'when', type: 'availability', label: '상담 가능한 시간대', required: true, mapsTo: 'preferred_schedule', availability: DEFAULT_AVAILABILITY },
  ],
}

const OK_ANSWERS = {
  c1: true, c2: false, name: ' 홍길동 ', nick: 'X', birth: '1990-03-02', wed: '아닙니다.', exp: ['없음'], drug: '',
  when: { cells: ['weekday|afternoon', 'weekday|evening', 'sat|morning'], startDate: '2026-11-10', method: '화상', contactTime: '평일 오후' },
}

Deno.test('checkDefinition: 정상 정의는 문제 없음', () => {
  assertEquals(checkDefinition(DEF), [])
})

Deno.test('checkDefinition: id 중복·빈 질문·선택지 없음·기존 칸 두 번 연결·민감정보 동의 없음', () => {
  const bad: FormDefinition = {
    intro: '',
    fields: [
      { id: 'a', type: 'short', label: '' },
      { id: 'a', type: 'single', label: '골라 주세요', options: [] },
      { id: 'b', type: 'short', label: '이름', mapsTo: 'client_name' },
      { id: 'c', type: 'short', label: '이름2', mapsTo: 'client_name' },
      { id: 'd', type: 'long', label: '약물', sensitive: true },
    ],
  }
  assertEquals(checkDefinition(bad).map((p) => p.problem).sort(), [
    'duplicate_id', 'empty_label', 'mapped_twice', 'no_options', 'no_sensitive_consent',
  ])
})

Deno.test('checkAnswers: 정상 답은 통과', () => {
  assertEquals(checkAnswers(DEF, OK_ANSWERS), {})
})

Deno.test('checkAnswers: 필수 동의·필수 문항이 비면 required', () => {
  const r = checkAnswers(DEF, { ...OK_ANSWERS, c1: false, name: '  ', when: { cells: [] } })
  assertEquals(r, { c1: 'required', name: 'required', when: 'required' })
})

Deno.test('checkAnswers: 없는 선택지·없는 칸·날짜 형식·길이', () => {
  const r = checkAnswers(DEF, {
    ...OK_ANSWERS, wed: '모름', exp: ['있음', '가끔'], birth: '1990/03/02', nick: 'x'.repeat(201),
    when: { cells: ['weekday|night'] },
  })
  assertEquals(r, { wed: 'option', exp: 'option', birth: 'format', nick: 'too_long', when: 'option' })
})

Deno.test('checkAnswers: 민감정보 동의 없이 민감정보 문항에 답하면 consent_needed', () => {
  assertEquals(checkAnswers(DEF, { ...OK_ANSWERS, drug: '수면제' }), { drug: 'consent_needed' })
  assertEquals(checkAnswers(DEF, { ...OK_ANSWERS, c2: true, drug: '수면제' }), {})
})

Deno.test('checkAnswers: 정의에 없는 답은 무시하지 않고 거부한다', () => {
  assertEquals(checkAnswers(DEF, { ...OK_ANSWERS, extra: 'x' }), { extra: 'unknown' })
})

Deno.test('summarizeAvailability: 요일별로 묶고 시작일·방식을 붙인다', () => {
  assertEquals(
    summarizeAvailability(DEFAULT_AVAILABILITY, OK_ANSWERS.when),
    '평일 오후·저녁, 토요일 오전 / 11월 10일부터 / 화상 / 연락: 평일 오후',
  )
  assertEquals(summarizeAvailability(DEFAULT_AVAILABILITY, { cells: ['sun|evening'] }), '일요일 저녁')
})

Deno.test('splitAnswers: 기존 칸·민감정보·추가 답변·동의로 나눈다', () => {
  const s = splitAnswers(DEF, { ...OK_ANSWERS, c2: true, drug: '수면제' })
  assertEquals(s.standard, {
    client_name: '홍길동', client_birth: '1990-03-02', counseling_experience: '없음',
    preferred_schedule: '평일 오후·저녁, 토요일 오전 / 11월 10일부터 / 화상 / 연락: 평일 오후', preferred_method: '화상',
  })
  assertEquals(s.sensitive, { medication_diagnosis: '수면제' })
  assertEquals(s.extra, [
    { id: 'nick', label: '닉네임', value: 'X' },
    { id: 'wed', label: '결혼 예정이신가요?', value: '아닙니다.' },
    { id: 'when', label: '상담 가능한 시간대', value: '평일 오후·저녁, 토요일 오전 / 11월 10일부터 / 화상 / 연락: 평일 오후' },
  ])
  assertEquals(s.consents, [
    { id: 'c1', label: '개인정보 제3자 제공 동의', kind: 'third_party', agreed: true },
    { id: 'c2', label: '민감정보 수집·이용 동의(선택)', kind: 'sensitive', agreed: true },
  ])
})

Deno.test('splitAnswers: 민감정보인데 기존 칸이 없으면 민감 추가 답변으로', () => {
  const def: FormDefinition = {
    intro: '',
    fields: [
      { id: 'c2', type: 'consent', label: '민감정보 동의', required: true, consentKind: 'sensitive' },
      { id: 'dx', type: 'short', label: '진단명', sensitive: true },
    ],
  }
  const s = splitAnswers(def, { c2: true, dx: 'ADHD' })
  assertEquals(s.extra, [])
  assertEquals(s.sensitiveExtra, [{ id: 'dx', label: '진단명', value: 'ADHD' }])
})

Deno.test('가능 시간대: 관리자가 바꾼 상담 방식·연락 시간·질문 문구', () => {
  const def: FormDefinition = {
    intro: '',
    fields: [{
      id: 'when', type: 'availability', label: '상담 가능한 시간대', required: true,
      availability: { ...DEFAULT_AVAILABILITY, methods: ['방문', '전화'], contactTimes: [], labels: { method: '희망하는 상담 형태' } },
    }],
  }
  assertEquals(checkDefinition(def), [])
  assertEquals(checkAnswers(def, { when: { cells: ['weekday|morning'], method: '전화' } }), {})
  assertEquals(checkAnswers(def, { when: { cells: ['weekday|morning'], method: '화상' } }), { when: 'option' })
  // 연락 시간 선택지를 비우면 묻지 않는다: 값이 오면 없는 선택지
  assertEquals(checkAnswers(def, { when: { cells: ['weekday|morning'], contactTime: '평일 오전' } }), { when: 'option' })
})
