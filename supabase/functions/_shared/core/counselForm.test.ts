import { assertEquals } from '@std/assert'
import {
  type FormDefinition, checkDefinition, checkAnswers, splitAnswers, summarizeAvailability, DEFAULT_AVAILABILITY,
  hasProviders, takesAnswer, withProviders, ledgerConsents, pruneHidden, hiddenIds, fieldLabel,
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

Deno.test('제공받는 업체 정보 블록: 답을 받지 않고, 답이 오면 unknown', () => {
  const def: FormDefinition = {
    intro: '',
    fields: [
      { id: 'c1', type: 'consent', label: '개인정보 제3자 제공 동의', required: true, consentKind: 'third_party' },
      { id: 'pv', type: 'providers', label: '제공받는 업체 정보' },
    ],
  }
  assertEquals(takesAnswer(def.fields[1]), false)
  assertEquals(checkDefinition(def), [])
  assertEquals(checkAnswers(def, { c1: true }), {})
  assertEquals(checkAnswers(def, { c1: true, pv: 'x' }), { pv: 'unknown' })
  assertEquals(hasProviders(def), true)
  assertEquals(hasProviders({ intro: '', fields: [def.fields[0]] }), false)
})

Deno.test('제3자 제공 동의 기록에 그때 보인 업체 이름을 남긴다 (업체 정보 블록이 있을 때만)', () => {
  const consents = [
    { id: 'c1', label: '제3자 제공', kind: 'third_party' as const, agreed: true },
    { id: 'c2', label: '민감정보', kind: 'sensitive' as const, agreed: false },
  ]
  const providers = [{ name: '가 센터', phone: '02-1', address: '서울' }, { name: '나 센터', phone: null, address: null }]
  assertEquals(withProviders(consents, providers, true), [
    { id: 'c1', label: '제3자 제공', kind: 'third_party', agreed: true, providers: ['가 센터', '나 센터'] },
    { id: 'c2', label: '민감정보', kind: 'sensitive', agreed: false },
  ])
  assertEquals(withProviders(consents, providers, false), consents)
})

Deno.test('원장 동의 칸: 제3자 제공·취소·환불 규정 동의를 종류로 찾아 채운다 (11-10)', () => {
  const c = (kind: 'third_party' | 'sensitive' | 'refund' | 'other', agreed: boolean) => ({ id: kind, label: kind, kind, agreed })
  assertEquals(ledgerConsents([c('third_party', true), c('refund', true)]), { consent_third_party: true, refund_policy_checked: true })
  assertEquals(ledgerConsents([c('third_party', true), c('refund', false)]), { consent_third_party: true, refund_policy_checked: false })
  // 환불 동의가 "그 밖의 동의"로 남은 옛 템플릿은 칸을 채우지 않는다 (글자로 짐작하지 않는다)
  assertEquals(ledgerConsents([c('third_party', true), c('other', true)]), { consent_third_party: true, refund_policy_checked: false })
})

// ── 11-10 기타 직접 입력 · 조건부 문항 · 응답 끼워 넣기 ──
const TOPIC_DEF: FormDefinition = {
  intro: '',
  fields: [
    { id: 'rel', type: 'single', label: '두 분은 어떤 사이인가요?', required: true, options: ['연애 중', '결혼했어요'] },
    { id: 'wed_years', type: 'short', label: '결혼한 지 얼마나 됐나요?', required: true, showIf: { field: 'rel', anyOf: ['결혼했어요'] } },
    { id: 'topics', type: 'multi', label: '이야기하고 싶은 주제', options: ['소통', '대인관계 (예: 여사친·남사친)', '금전적/경제적 문제'], other: true },
    { id: 'span', type: 'single', label: '{{topics}}에 대해 갈등이 있었다면, 지속된 기간을 알려 주세요', required: true, options: ['최근 3개월 이내', '1년~3년'], showIf: { field: 'topics' } },
    { id: 'pick', type: 'single', label: '하나만', options: ['가', '나'], other: true },
  ],
}

Deno.test('기타 직접 입력: 선택지에 없는 값 하나를 기타 글로 받는다', () => {
  const ok = { rel: '연애 중', topics: ['소통', '육아'], span: '1년~3년', pick: '다' }
  assertEquals(checkAnswers(TOPIC_DEF, ok), {})
  // 기타 글은 하나만, 기타를 받지 않는 문항은 그대로 option
  assertEquals(checkAnswers(TOPIC_DEF, { ...ok, topics: ['육아', '돈'] }), { topics: 'option' })
  assertEquals(checkAnswers(TOPIC_DEF, { ...ok, rel: '친구' }), { rel: 'option' })
  // 빈 기타 글은 고르지 않은 것과 같다
  assertEquals(checkAnswers(TOPIC_DEF, { ...ok, topics: ['소통', '  '] }), { topics: 'option' })
  assertEquals(checkAnswers(TOPIC_DEF, { ...ok, pick: 'x'.repeat(201) }), { pick: 'too_long' })
})

Deno.test('조건부 문항: 조건이 안 맞으면 필수여도 묻지 않고, 답이 오면 unknown', () => {
  assertEquals(checkAnswers(TOPIC_DEF, { rel: '연애 중' }), {})
  assertEquals(checkAnswers(TOPIC_DEF, { rel: '결혼했어요' }), { wed_years: 'required' })
  assertEquals(checkAnswers(TOPIC_DEF, { rel: '결혼했어요', wed_years: '3년' }), {})
  assertEquals(checkAnswers(TOPIC_DEF, { rel: '연애 중', wed_years: '3년' }), { wed_years: 'unknown' })
  // 주제를 고르면 기간이 필수가 된다
  assertEquals(checkAnswers(TOPIC_DEF, { rel: '연애 중', topics: ['소통'] }), { span: 'required' })
  assertEquals(checkAnswers(TOPIC_DEF, { rel: '연애 중', span: '1년~3년' }), { span: 'unknown' })
})

Deno.test('조건부 문항: 숨은 답을 지우고, 조건이 이어지면 함께 숨는다', () => {
  const def: FormDefinition = {
    intro: '',
    fields: [
      { id: 'a', type: 'single', label: 'a', options: ['예', '아니오'] },
      { id: 'b', type: 'single', label: 'b', options: ['예', '아니오'], showIf: { field: 'a', anyOf: ['예'] } },
      { id: 'c', type: 'short', label: 'c', showIf: { field: 'b', anyOf: ['예'] } },
    ],
  }
  assertEquals(pruneHidden(def, { a: '아니오', b: '예', c: '글' }), { a: '아니오' })
  assertEquals(pruneHidden(def, { a: '예', b: '예', c: '글' }), { a: '예', b: '예', c: '글' })
  assertEquals([...hiddenIds(def, { a: '아니오', b: '예' })].sort(), ['b', 'c'])
})

Deno.test('민감정보 문항: 민감정보 동의를 하지 않으면 숨고, 답이 오면 consent_needed', () => {
  assertEquals([...hiddenIds(DEF, { ...OK_ANSWERS, c2: false })], ['drug'])
  assertEquals([...hiddenIds(DEF, { ...OK_ANSWERS, c2: true })], [])
  assertEquals(pruneHidden(DEF, { c2: false, drug: '수면제' }), { c2: false })
})

Deno.test('응답 끼워 넣기: 고른 답을 쉼표로 잇고, 괄호 설명은 빼고, 기타는 쓴 글로', () => {
  const span = TOPIC_DEF.fields[3]
  assertEquals(fieldLabel(TOPIC_DEF, span, { topics: ['소통', '대인관계 (예: 여사친·남사친)', '육아'] }),
    '소통, 대인관계, 육아에 대해 갈등이 있었다면, 지속된 기간을 알려 주세요')
  assertEquals(fieldLabel(TOPIC_DEF, span, { topics: ['금전적/경제적 문제'] }),
    '금전적/경제적 문제에 대해 갈등이 있었다면, 지속된 기간을 알려 주세요')
  // 답이 없으면 그 문항의 제목으로 채운다
  assertEquals(fieldLabel(TOPIC_DEF, span, {}), '이야기하고 싶은 주제에 대해 갈등이 있었다면, 지속된 기간을 알려 주세요')
})

Deno.test('원장 저장: 고객이 본 제목으로 남기고, 기타 글은 "기타: "를 붙인다', () => {
  const s = splitAnswers(TOPIC_DEF, { rel: '연애 중', topics: ['소통', '육아'], span: '1년~3년', pick: '다' })
  assertEquals(s.extra, [
    { id: 'rel', label: '두 분은 어떤 사이인가요?', value: '연애 중' },
    { id: 'topics', label: '이야기하고 싶은 주제', value: '소통, 기타: 육아' },
    { id: 'span', label: '소통, 육아에 대해 갈등이 있었다면, 지속된 기간을 알려 주세요', value: '1년~3년' },
    { id: 'pick', label: '하나만', value: '기타: 다' },
  ])
})

Deno.test('checkDefinition: 조건과 끼워 넣기는 앞 문항만 가리킨다', () => {
  assertEquals(checkDefinition(TOPIC_DEF), [])
  const bad: FormDefinition = {
    intro: '',
    fields: [
      { id: 'x', type: 'short', label: '{{y}} 이야기', showIf: { field: 'y' } },
      { id: 'y', type: 'single', label: 'y', options: ['가'] },
      { id: 'z', type: 'short', label: '{{nope}}', showIf: { field: 'y', anyOf: ['없는 답'] } },
    ],
  }
  assertEquals(checkDefinition(bad).map((p) => `${p.fieldId}:${p.problem}`).sort(), [
    'x:bad_condition', 'x:bad_reference', 'z:bad_condition', 'z:bad_reference',
  ])
})
