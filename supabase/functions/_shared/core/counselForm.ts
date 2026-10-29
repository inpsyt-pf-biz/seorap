// 상담 신청서 템플릿의 문항 정의와 답 검사 (B2). 서랍 신청서 화면·서랍 서버·상담 어드민(편집·미리보기·원장 저장)이 같이 쓴다.
// 정의는 상담 어드민에서 게시한 판(form_template_versions.definition)에 JSON 으로 들어 있다.

export type FieldType = 'consent' | 'notice' | 'section' | 'short' | 'long' | 'single' | 'multi' | 'date' | 'availability'
// 상담 원장(counsel.applications · application_sensitive)의 기존 칸. 연결하지 않은 답은 추가 답변으로 간다
export type StandardField =
  | 'client_name' | 'client_birth' | 'residence' | 'reason' | 'preferred_schedule' | 'preferred_method'
  | 'counseling_experience' | 'expectation' | 'medication_diagnosis'
export const STANDARD_FIELDS: StandardField[] = [
  'client_name', 'client_birth', 'residence', 'reason', 'preferred_schedule', 'preferred_method',
  'counseling_experience', 'expectation', 'medication_diagnosis',
]
export type ConsentKind = 'third_party' | 'sensitive' | 'other'

export type AvailabilityConfig = {
  days: { id: string; label: string }[]
  slots: { id: string; label: string; hours: string }[]
  askStartDate: boolean
  methods: string[]
  contactTimes: string[]
  // 신청서에 보이는 안내·질문 문구. 비우면 서랍 기본 문구(form.avail.*)
  labels?: Partial<Record<AvailabilityLabel, string>>
}
export type AvailabilityLabel = 'pick' | 'start' | 'method' | 'contact'
export const DEFAULT_AVAILABILITY: AvailabilityConfig = {
  days: [{ id: 'weekday', label: '평일' }, { id: 'sat', label: '토요일' }, { id: 'sun', label: '일요일' }],
  slots: [
    { id: 'morning', label: '오전', hours: '9~12시' },
    { id: 'afternoon', label: '오후', hours: '12~18시' },
    { id: 'evening', label: '저녁', hours: '18~21시' },
  ],
  askStartDate: true,
  methods: ['대면', '화상', '상관없음'],
  contactTimes: ['평일 오전', '평일 오후', '평일 저녁', '상관없음'],
}

export type FormField = {
  id: string
  type: FieldType
  label: string
  help?: string
  required?: boolean
  options?: string[]
  sensitive?: boolean
  mapsTo?: StandardField | null
  consentKind?: ConsentKind
  availability?: AvailabilityConfig
}
export type FormDefinition = { intro: string; fields: FormField[] }

// 가능 시간대 답: 고른 칸은 "요일id|시간대id"
export type AvailabilityAnswer = { cells: string[]; startDate?: string; method?: string; contactTime?: string }
export type AnswerValue = string | string[] | boolean | AvailabilityAnswer
export type Answers = Record<string, unknown>

export const LIMITS = { short: 200, long: 2000 }
const INPUT_TYPES: FieldType[] = ['consent', 'short', 'long', 'single', 'multi', 'date', 'availability']
export const takesAnswer = (f: FormField) => INPUT_TYPES.includes(f.type)

export type DefinitionProblem = {
  fieldId: string
  problem: 'duplicate_id' | 'empty_label' | 'no_options' | 'mapped_twice' | 'no_sensitive_consent' | 'no_availability'
}

// 게시 전에 정의를 검사한다 (어드민 [게시]와 DB 함수 양쪽에서)
export function checkDefinition(def: FormDefinition): DefinitionProblem[] {
  const out: DefinitionProblem[] = []
  const seen = new Set<string>()
  const mapped = new Set<StandardField>()
  for (const f of def.fields) {
    if (seen.has(f.id)) out.push({ fieldId: f.id, problem: 'duplicate_id' })
    seen.add(f.id)
    if (!f.label.trim()) out.push({ fieldId: f.id, problem: 'empty_label' })
    if ((f.type === 'single' || f.type === 'multi') && !(f.options ?? []).some((o) => o.trim())) out.push({ fieldId: f.id, problem: 'no_options' })
    if (f.type === 'availability' && !(f.availability && f.availability.days.length && f.availability.slots.length)) {
      out.push({ fieldId: f.id, problem: 'no_availability' })
    }
    if (f.mapsTo) {
      if (mapped.has(f.mapsTo)) out.push({ fieldId: f.id, problem: 'mapped_twice' })
      mapped.add(f.mapsTo)
    }
  }
  // 민감정보 문항이 있으면 민감정보 동의가 따로 있어야 한다 (01-plan §0 10-07)
  const sensitive = def.fields.find((f) => f.sensitive && takesAnswer(f))
  if (sensitive && !def.fields.some((f) => f.type === 'consent' && f.consentKind === 'sensitive')) {
    out.push({ fieldId: sensitive.id, problem: 'no_sensitive_consent' })
  }
  return out
}

export type AnswerProblem = 'required' | 'option' | 'format' | 'too_long' | 'unknown' | 'consent_needed'

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)

function isEmpty(f: FormField, v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (f.type === 'consent') return v !== true
  if (f.type === 'multi') return !Array.isArray(v) || v.length === 0
  if (f.type === 'availability') return !(typeof v === 'object' && Array.isArray((v as AvailabilityAnswer).cells) && (v as AvailabilityAnswer).cells.length > 0)
  return typeof v !== 'string' || v.trim() === ''
}

function checkOne(f: FormField, v: unknown): AnswerProblem | null {
  switch (f.type) {
    case 'consent': return typeof v === 'boolean' ? null : 'format'
    case 'short': case 'long':
      if (typeof v !== 'string') return 'format'
      return v.trim().length > LIMITS[f.type] ? 'too_long' : null
    case 'date': return typeof v === 'string' && isDate(v.trim()) ? null : 'format'
    case 'single': return typeof v === 'string' && (f.options ?? []).includes(v) ? null : 'option'
    case 'multi':
      if (!Array.isArray(v)) return 'format'
      return v.every((x) => (f.options ?? []).includes(x)) ? null : 'option'
    case 'availability': {
      const a = v as AvailabilityAnswer
      const cfg = f.availability ?? DEFAULT_AVAILABILITY
      if (typeof a !== 'object' || !Array.isArray(a.cells)) return 'format'
      const cells = new Set(cfg.days.flatMap((d) => cfg.slots.map((s) => `${d.id}|${s.id}`)))
      if (!a.cells.every((c) => cells.has(c))) return 'option'
      if (a.startDate !== undefined && a.startDate !== '' && !(cfg.askStartDate && isDate(a.startDate))) return 'format'
      if (a.method !== undefined && a.method !== '' && !cfg.methods.includes(a.method)) return 'option'
      if (a.contactTime !== undefined && a.contactTime !== '' && !cfg.contactTimes.includes(a.contactTime)) return 'option'
      return null
    }
    default: return 'unknown'
  }
}

// 문항 id → 문제. 빈 객체면 통과. 화면과 서버가 같은 함수로 검사한다
export function checkAnswers(def: FormDefinition, answers: Answers): Record<string, AnswerProblem> {
  const out: Record<string, AnswerProblem> = {}
  const byId = new Map(def.fields.filter(takesAnswer).map((f) => [f.id, f]))
  for (const k of Object.keys(answers)) if (!byId.has(k)) out[k] = 'unknown'
  const sensitiveAgreed = def.fields.some((f) => f.type === 'consent' && f.consentKind === 'sensitive' && answers[f.id] === true)
  for (const f of byId.values()) {
    const v = answers[f.id]
    if (isEmpty(f, v)) {
      if (f.required) out[f.id] = 'required'
      continue
    }
    const p = checkOne(f, v)
    if (p) { out[f.id] = p; continue }
    if (f.sensitive && !sensitiveAgreed) out[f.id] = 'consent_needed'
  }
  return out
}

function monthDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}월 ${d}일`
}

// "평일 오후·저녁, 토요일 오전 / 11월 10일부터 / 화상 / 연락: 평일 오후" (상담 원장 희망 일정 칸에 넣는 한 줄)
export function summarizeAvailability(cfg: AvailabilityConfig, a: AvailabilityAnswer): string {
  const picked = new Set(a.cells)
  const days = cfg.days
    .map((d) => ({ d, slots: cfg.slots.filter((s) => picked.has(`${d.id}|${s.id}`)) }))
    .filter((x) => x.slots.length)
    .map((x) => `${x.d.label} ${x.slots.map((s) => s.label).join('·')}`)
  const parts = [days.join(', ')]
  if (a.startDate) parts.push(`${monthDay(a.startDate)}부터`)
  if (a.method) parts.push(a.method)
  if (a.contactTime) parts.push(`연락: ${a.contactTime}`)
  return parts.join(' / ')
}

function asText(f: FormField, v: unknown): string {
  if (f.type === 'multi') return (v as string[]).join(', ')
  if (f.type === 'availability') return summarizeAvailability(f.availability ?? DEFAULT_AVAILABILITY, v as AvailabilityAnswer)
  return String(v).trim()
}

export type SplitAnswers = {
  standard: Partial<Record<Exclude<StandardField, 'medication_diagnosis'>, string>>
  sensitive: Partial<Record<'medication_diagnosis', string>>
  extra: { id: string; label: string; value: string }[]
  sensitiveExtra: { id: string; label: string; value: string }[]
  consents: { id: string; label: string; kind: ConsentKind; agreed: boolean }[]
}

// 검사를 통과한 답을 상담 원장의 칸으로 나눈다. 빈 답은 넣지 않는다
export function splitAnswers(def: FormDefinition, answers: Answers): SplitAnswers {
  const out: SplitAnswers = { standard: {}, sensitive: {}, extra: [], sensitiveExtra: [], consents: [] }
  for (const f of def.fields.filter(takesAnswer)) {
    const v = answers[f.id]
    if (f.type === 'consent') {
      out.consents.push({ id: f.id, label: f.label, kind: f.consentKind ?? 'other', agreed: v === true })
      continue
    }
    if (isEmpty(f, v)) continue
    const text = asText(f, v)
    if (f.mapsTo === 'medication_diagnosis') out.sensitive.medication_diagnosis = text
    else if (f.mapsTo) out.standard[f.mapsTo] = text
    else if (f.sensitive) out.sensitiveExtra.push({ id: f.id, label: f.label, value: text })
    else out.extra.push({ id: f.id, label: f.label, value: text })
    if (f.type === 'availability') {
      const method = (v as AvailabilityAnswer).method
      if (method) out.standard.preferred_method = method
      // 기존 칸에 연결했어도 고른 칸을 추가 답변에 함께 남긴다
      if (f.mapsTo) out.extra.push({ id: f.id, label: f.label, value: text })
    }
  }
  return out
}
