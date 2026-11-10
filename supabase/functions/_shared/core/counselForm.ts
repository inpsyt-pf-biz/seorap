// 상담 신청서 템플릿의 문항 정의와 답 검사 (B2). 서랍 신청서 화면·서랍 서버·상담 어드민(편집·미리보기·원장 저장)이 같이 쓴다.
// 정의는 상담 어드민에서 게시한 판(form_template_versions.definition)에 JSON 으로 들어 있다.

// providers: 제공받는 업체 정보(11-04). 글을 쓰지 않고, 상담 어드민의 운영 중인 협력센터 목록이 들어간다
export type FieldType = 'consent' | 'notice' | 'section' | 'providers' | 'short' | 'long' | 'single' | 'multi' | 'date' | 'availability'
// 상담 원장(counsel.applications · application_sensitive)의 기존 칸. 연결하지 않은 답은 추가 답변으로 간다
export type StandardField =
  | 'client_name' | 'client_birth' | 'residence' | 'reason' | 'preferred_schedule' | 'preferred_method'
  | 'counseling_experience' | 'expectation' | 'medication_diagnosis'
export const STANDARD_FIELDS: StandardField[] = [
  'client_name', 'client_birth', 'residence', 'reason', 'preferred_schedule', 'preferred_method',
  'counseling_experience', 'expectation', 'medication_diagnosis',
]
// refund: 취소·환불 규정 확인 (11-10). 원장의 refund_policy_checked 칸을 이 종류의 동의로 채운다
export type ConsentKind = 'third_party' | 'sensitive' | 'refund' | 'other'

export type AvailabilityConfig = {
  days: { id: string; label: string }[]
  slots: { id: string; label: string; hours: string }[]
  askStartDate: boolean
  methods: string[]
  contactTimes: string[]
  // 신청서에 보이는 안내·질문 문구. 비우면 서랍 기본 문구(form.avail.*)
  labels?: Partial<Record<AvailabilityLabel, string>>
  // 11-10 질문 아래 작은 설명 (예: 상담 방식 → "대면 상담은 서울시 마포구 홍대입구 인근의 직영 상담센터에서 진행됩니다.")
  helps?: Partial<Record<AvailabilityHelp, string>>
}
export type AvailabilityLabel = 'pick' | 'start' | 'method' | 'contact'
export type AvailabilityHelp = 'start' | 'method' | 'contact'
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
  // 11-10 기타(직접 입력): 단일·복수 선택에서 선택지 밖의 글 하나를 받는다
  other?: boolean
  // 11-10 조건부 표시: 앞 문항(field)에 답했을 때만(anyOf 가 있으면 그중 하나를 골랐을 때만) 보인다
  showIf?: { field: string; anyOf?: string[] }
  // 11-10 입력 칸 안에 흐리게 보이는 예시 (단답·장문). 예: 서울 마포구
  placeholder?: string
}
export type FormDefinition = { intro: string; fields: FormField[] }

// 개인정보를 제공받는 업체(운영 중인 협력센터). 담당자 이름·연락처는 넣지 않는다
export type Provider = { name: string; phone: string | null; address: string | null }
export const hasProviders = (def: FormDefinition) => def.fields.some((f) => f.type === 'providers')

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
    | 'bad_condition' | 'bad_reference'
}

// 제목 안의 {{문항id}} 자리에 그 문항의 답이 들어간다 (11-10)
const TOKEN = /\{\{\s*([\w-]+)\s*\}\}/g
export const labelRefs = (label: string) => [...label.matchAll(TOKEN)].map((m) => m[1])

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
    // 조건과 끼워 넣기는 앞에 있는, 답을 받는 문항만 가리킨다
    const before = def.fields.slice(0, def.fields.indexOf(f)).filter(takesAnswer)
    if (f.showIf) {
      const src = before.find((x) => x.id === f.showIf!.field)
      const anyOk = !f.showIf.anyOf?.length || (!!src && (src.type === 'single' || src.type === 'multi')
        && f.showIf.anyOf.every((o) => (src.options ?? []).includes(o)))
      if (!src || !anyOk) out.push({ fieldId: f.id, problem: 'bad_condition' })
    }
    if (labelRefs(f.label).some((id) => !before.some((x) => x.id === id))) out.push({ fieldId: f.id, problem: 'bad_reference' })
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
    case 'single': case 'multi': {
      const list = f.type === 'single' ? [v] : v
      if (!Array.isArray(list) || !list.every((x) => typeof x === 'string')) return f.type === 'single' ? 'option' : 'format'
      const outside = (list as string[]).filter((x) => !(f.options ?? []).includes(x))
      if (outside.length === 0) return null
      // 기타 글: 기타를 받는 문항에서 하나만, 비어 있지 않게
      if (!f.other || outside.length > 1 || !outside[0].trim()) return 'option'
      return outside[0].trim().length > LIMITS.short ? 'too_long' : null
    }
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
  const hidden = hiddenIds(def, answers)
  for (const f of byId.values()) {
    const v = answers[f.id]
    if (hidden.has(f.id)) {
      // 숨은 문항은 묻지 않는다. 답이 왔으면 화면이 지우지 않은 것이므로 거부한다
      if (!isEmpty(f, v)) out[f.id] = f.sensitive && !sensitiveAgreed ? 'consent_needed' : 'unknown'
      continue
    }
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

// 지금 답으로는 보이지 않는 문항 (11-10). 앞에서부터 차례로 보며, 숨은 문항의 답은 없는 것으로 친다(조건이 이어지면 함께 숨는다).
// 민감정보 문항은 민감정보 동의를 했을 때만 보인다
export function hiddenIds(def: FormDefinition, answers: Answers): Set<string> {
  const hidden = new Set<string>()
  const live = (id: string) => (hidden.has(id) ? undefined : answers[id])
  const sensitiveConsents = def.fields.filter((f) => f.type === 'consent' && f.consentKind === 'sensitive')
  for (const f of def.fields) {
    if (f.sensitive && takesAnswer(f) && sensitiveConsents.length && !sensitiveConsents.some((c) => live(c.id) === true)) {
      hidden.add(f.id); continue
    }
    if (!f.showIf) continue
    const src = def.fields.find((x) => x.id === f.showIf!.field)
    const v = live(f.showIf.field)
    if (!src || isEmpty(src, v)) { hidden.add(f.id); continue }
    const anyOf = f.showIf.anyOf ?? []
    if (anyOf.length && !(Array.isArray(v) ? v : [v]).some((x) => anyOf.includes(x as string))) hidden.add(f.id)
  }
  return hidden
}

// 숨은 문항의 답을 뺀다. 화면이 제출하기 전에 부른다
export function pruneHidden(def: FormDefinition, answers: Answers): Answers {
  const hidden = hiddenIds(def, answers)
  return Object.fromEntries(Object.entries(answers).filter(([id]) => !hidden.has(id)))
}

// 고른 답과 기타 글 나누기
function choiceParts(f: FormField, v: unknown): { picked: string[]; other: string | null } {
  const list = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  const picked = list.filter((x) => (f.options ?? []).includes(x))
  const other = list.find((x) => !(f.options ?? []).includes(x))
  return { picked, other: other?.trim() ?? null }
}

// 다른 문항 제목에 끼워 넣는 글: 선택지 끝 괄호 설명은 빼고, 기타는 쓴 글 그대로
function pipeText(f: FormField, v: unknown): string {
  if (f.type === 'single' || f.type === 'multi') {
    const { picked, other } = choiceParts(f, v)
    return [...picked.map((o) => o.replace(/\s*[(（][^)）]*[)）]\s*$/, '')), ...(other ? [other] : [])].join(', ')
  }
  if (f.type === 'availability' || f.type === 'consent') return ''
  return typeof v === 'string' ? v.trim() : ''
}

// 고객에게 보이는 제목: {{문항id}} 자리에 그 문항의 답(없으면 그 문항의 제목)
export function fieldLabel(def: FormDefinition, f: FormField, answers: Answers): string {
  return f.label.replace(TOKEN, (_, id: string) => {
    const src = def.fields.find((x) => x.id === id)
    if (!src) return ''
    return pipeText(src, answers[id]) || src.label
  })
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

// 원장·확인 화면에 보이는 답 한 줄
export function answerText(f: FormField, v: unknown): string {
  if (f.type === 'single' || f.type === 'multi') {
    const { picked, other } = choiceParts(f, v)
    return [...picked, ...(other ? [`기타: ${other}`] : [])].join(', ')
  }
  if (f.type === 'availability') return summarizeAvailability(f.availability ?? DEFAULT_AVAILABILITY, v as AvailabilityAnswer)
  return String(v).trim()
}

// 만 나이 (11-10): 올해 생일이 지났으면 해 차이, 아직이면 하나 뺀다. 날짜 모양이 아니거나 미래면 null
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/
export function ageOn(birth: string, today: string): number | null {
  const b = ISO_DAY.exec(birth)
  const d = ISO_DAY.exec(today)
  if (!b || !d) return null
  const age = Number(d[1]) - Number(b[1]) - (`${d[2]}${d[3]}` < `${b[2]}${b[3]}` ? 1 : 0)
  return age < 0 ? null : age
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
  const hidden = hiddenIds(def, answers)
  for (const f of def.fields.filter(takesAnswer)) {
    if (hidden.has(f.id)) continue
    const v = answers[f.id]
    // 원장에는 고객이 실제로 본 제목을 남긴다 (끼워 넣은 답 포함)
    const label = fieldLabel(def, f, answers)
    if (f.type === 'consent') {
      out.consents.push({ id: f.id, label: f.label, kind: f.consentKind ?? 'other', agreed: v === true })
      continue
    }
    if (isEmpty(f, v)) continue
    const text = answerText(f, v)
    if (f.mapsTo === 'medication_diagnosis') out.sensitive.medication_diagnosis = text
    else if (f.mapsTo) out.standard[f.mapsTo] = text
    else if (f.sensitive) out.sensitiveExtra.push({ id: f.id, label, value: text })
    else out.extra.push({ id: f.id, label, value: text })
    if (f.type === 'availability') {
      const method = (v as AvailabilityAnswer).method
      if (method) out.standard.preferred_method = method
      // 기존 칸에 연결했어도 고른 칸을 추가 답변에 함께 남긴다
      if (f.mapsTo) out.extra.push({ id: f.id, label, value: text })
    }
  }
  return out
}

export type ConsentRecord = SplitAnswers['consents'][number] & { providers?: string[] }

// 업체 정보 블록이 있는 신청서면, 제3자 제공 동의 기록에 그때 보인 업체 이름을 함께 남긴다 ("누구에게 제공하는 데 동의했는지")
export function withProviders(consents: SplitAnswers['consents'], providers: Provider[], shown: boolean): ConsentRecord[] {
  if (!shown) return consents
  return consents.map((c) => (c.kind === 'third_party' ? { ...c, providers: providers.map((p) => p.name) } : c))
}

// 상담 원장의 동의 칸(구매 건 상세·수기 등록이 쓰는 칸). 원문 동의 기록(consents)과 어긋나지 않게 종류로만 찾는다
export function ledgerConsents(consents: SplitAnswers['consents']): { consent_third_party: boolean; refund_policy_checked: boolean } {
  const agreed = (kind: ConsentKind) => consents.some((c) => c.kind === kind && c.agreed)
  return { consent_third_party: agreed('third_party'), refund_policy_checked: agreed('refund') }
}
