// 구매 건·상담 상태 규칙. 허용값은 DB CHECK(20261012000003_purchases_sessions.sql)와 같아야 하고 purchases.test.ts 가 대조한다.
import { formatKstDate } from '../../supabase/functions/_shared/core/time.ts'
import { t, type CopyKey } from './copy.ko.ts'
import { orderTone } from './naverOrder.ts'

// 구매 구분: 현행 구글폼 신청서 4종
export const PURCHASE_TYPES = ['test_main', 'counsel_main', 'sponsored', 'group_buy'] as const
export type PurchaseType = (typeof PURCHASE_TYPES)[number]

// 상담 상태(기획 문서 Step 3의 상태별 건수와 같은 이름)
// 미배정 → 예약 요청(센터에 배정되어 예약을 기다림) → 예약 확정 → 상담 완료. 이탈: 상담 불가, 취소
export const SESSION_STATUSES = ['unassigned', 'requested', 'confirmed', 'completed', 'unable', 'cancelled'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

// 배정·다시 배정을 할 수 있는 상태. DB 함수 rpc_assign_sessions 와 같다(상담 불가 건은 다른 센터로 다시 배정한다).
export const ASSIGNABLE_STATUSES: readonly SessionStatus[] = ['unassigned', 'requested', 'unable']

// 네이버 상품 목록표에 없는 상품으로 들어온 구매 건은 구분이 비어 있다(미분류)
export function purchaseTypeLabel(v: string | null): string {
  if (v === null) return t('purchase.type.unclassified')
  return (PURCHASE_TYPES as readonly string[]).includes(v) ? t(`purchase.type.${v}` as CopyKey) : v
}

export function sessionStatusLabel(v: string): string {
  return (SESSION_STATUSES as readonly string[]).includes(v) ? t(`session.status.${v}` as CopyKey) : v
}

export type SessionSummary = { id: string; seq: number; status: SessionStatus; center_id: string | null; scheduled_at: string | null }

export type ApplicationSummary = {
  client_name: string | null
  client_phone: string | null
  guardian_name: string | null
  guardian_phone: string | null
  test_name: string | null
  submitted_at: string | null
  residence: string | null
  preferred_method: string | null
  preferred_schedule: string | null
}

export type NaverSummary = {
  naver_product_order_id: string
  product_order_status: string | null
  claim_status: string | null
  option_name: string | null
  needs_review: boolean
}

export type PurchaseRow = {
  id: string
  purchase_type: PurchaseType | null
  product_name: string | null
  paid_at: string | null
  source: 'manual' | 'sheet_import' | 'naver'
  created_at: string
  applications: ApplicationSummary | null
  naver_product_orders: NaverSummary | null
  // 주문자 가린 이름·연락처(본사만 읽는다). 신청서가 아직 없는 네이버 건의 이름 칸과 대기함 후보 찾기에 쓴다
  naver_orderers: { name_masked: string | null; tel_masked: string | null } | null
  // 구매자 아래 검사들(목록의 '진행 검사' 칸에 검사마다 응시 상태를 붙인다)
  purchase_tests: { test_name: string; unit_no: number | null; exam_status: string }[]
  sessions: SessionSummary[]
}

export const PURCHASE_LIST_COLUMNS =
  'id, purchase_type, product_name, paid_at, source, created_at, '
  + 'applications(client_name, client_phone, guardian_name, guardian_phone, test_name, submitted_at, residence, preferred_method, preferred_schedule), '
  + 'naver_product_orders(naver_product_order_id, product_order_status, claim_status, option_name, needs_review), naver_orderers(name_masked, tel_masked), '
  + 'purchase_tests(test_name, unit_no, exam_status), sessions(id, seq, status, center_id, scheduled_at)'

// 목록의 한 줄이 대표로 보여 줄 회차: 아직 끝나지 않은 첫 회차, 없으면 마지막 완료 회차, 그것도 없으면 첫 회차(모두 취소)
export function mainSession(p: Pick<PurchaseRow, 'sessions'>): SessionSummary | null {
  const byseq = [...p.sessions].sort((a, b) => a.seq - b.seq)
  return byseq.find((s) => s.status !== 'completed' && s.status !== 'cancelled')
    ?? byseq.filter((s) => s.status === 'completed').at(-1)
    ?? byseq[0]
    ?? null
}

// 회차가 여러 개인 구매 건(수량 2 이상 등)의 진행: 취소를 뺀 회차 수와 완료 회차 수
export function sessionProgress(p: Pick<PurchaseRow, 'sessions'>): { total: number; completed: number } {
  const live = p.sessions.filter((s) => s.status !== 'cancelled')
  return { total: live.length, completed: live.filter((s) => s.status === 'completed').length }
}

// 고른 구매 건들에서 배정할 수 있는 회차를 모두 모은다(한 구매 건의 남은 회차는 같은 센터로 간다)
export function assignableSessionIds(rows: Pick<PurchaseRow, 'id' | 'sessions'>[], selected: Set<string>): string[] {
  return rows.filter((r) => selected.has(r.id))
    .flatMap((r) => [...r.sessions].sort((a, b) => a.seq - b.seq))
    .filter((s) => ASSIGNABLE_STATUSES.includes(s.status))
    .map((s) => s.id)
}

// 이름 칸: 내담자 이름, 없으면 보호자 이름, 신청서가 아직 없으면 네이버 주문자(가린 이름)
export function clientLabel(p: Pick<PurchaseRow, 'applications' | 'naver_orderers'>): string {
  return p.applications?.client_name ?? p.applications?.guardian_name ?? p.naver_orderers?.name_masked ?? t('center.empty')
}

// 이름 아래 연락처: 신청서의 내담자 번호, 없으면 보호자 번호, 신청서가 없으면 네이버 주문자(가린 번호)
export function contactLabel(p: Pick<PurchaseRow, 'applications' | 'naver_orderers'>): string | null {
  return p.applications?.client_phone || p.applications?.guardian_phone || p.naver_orderers?.tel_masked || null
}

// 진행 단계(구매는 빼고 신청서 작성부터). 숫자는 "지금 그 단계에 머물러 있는 건"이다.
// 신청서 작성: 신청서를 기다림 → 센터 배정: 신청서는 왔고 센터를 정해야 함 → 예약 요청 → 예약 확정 → 상담 완료
export const STAGES = ['application', 'assign', 'request', 'confirmed', 'completed'] as const
export type Stage = (typeof STAGES)[number]
// 단계에서 빠진 건. 단계 칸 아래에 따로 센다
export const STAGE_EXITS = ['unable', 'cancelled'] as const
export type StageExit = (typeof STAGE_EXITS)[number]
export type StageInfo = { stage: Stage; exit: StageExit | null }

// 상담 회차가 없는 구매 건(검사만 산 주문)은 단계가 없다(null)
// 상담 불가·취소는 남은 기록으로 멈춘 단계를 정한다: 예약 일시가 있으면 예약 확정, 센터가 있으면 예약 요청,
// 신청서가 있으면 센터 배정, 없으면 신청서 작성. 상태를 바꿔도 센터·일시는 지워지지 않는다(rpc_session_action)
export function purchaseStage(p: Pick<PurchaseRow, 'applications' | 'sessions'>): StageInfo | null {
  const s = mainSession(p)
  if (!s) return null
  const reached: Stage = s.scheduled_at ? 'confirmed' : s.center_id ? 'request' : p.applications ? 'assign' : 'application'
  switch (s.status) {
    case 'unassigned': return { stage: p.applications ? 'assign' : 'application', exit: null }
    case 'requested': return { stage: 'request', exit: null }
    case 'confirmed': return { stage: 'confirmed', exit: null }
    case 'completed': return { stage: 'completed', exit: null }
    case 'unable': return { stage: reached, exit: 'unable' }
    case 'cancelled': return { stage: reached, exit: 'cancelled' }
  }
}

export type StageCounts = { all: number; testOnly: number; stage: Record<Stage, number>; exit: Record<Stage, Record<StageExit, number>> }

export function countByStage(rows: Pick<PurchaseRow, 'applications' | 'sessions'>[]): StageCounts {
  const c: StageCounts = {
    all: rows.length, testOnly: 0,
    stage: Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>,
    exit: Object.fromEntries(STAGES.map((s) => [s, { unable: 0, cancelled: 0 }])) as Record<Stage, Record<StageExit, number>>,
  }
  for (const r of rows) {
    const info = purchaseStage(r)
    if (!info) c.testOnly += 1
    else if (info.exit) c.exit[info.stage][info.exit] += 1
    else c.stage[info.stage] += 1
  }
  return c
}

// 단계 거르기 값: '' 전체, 단계, '단계:불가·취소', 검사만
export const STAGE_TEST_ONLY = '__test_only__'
export const stageKey = (stage: Stage, exit: StageExit | null = null) => (exit ? `${stage}:${exit}` : stage)

function matchStage(p: Pick<PurchaseRow, 'applications' | 'sessions'>, f: string): boolean {
  if (!f) return true
  const info = purchaseStage(p)
  if (f === STAGE_TEST_ONLY) return !info
  return !!info && stageKey(info.stage, info.exit) === f
}

// 기간 거르기(구매일시, 한국 시각 날짜 기준). 앞 칸은 고르기 쉬운 기간, 직접 입력이면 from·to 를 쓴다
export const PERIODS = ['today', '7d', '30d', 'custom'] as const
export type Period = (typeof PERIODS)[number]

export function periodRange(period: Period, today: string): { from: string; to: string } | null {
  if (period === 'custom') return null
  const days = period === 'today' ? 0 : period === '7d' ? 6 : 29
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return { from: d.toISOString().slice(0, 10), to: today }
}

function matchPeriod(paidAt: string | null, from: string, to: string): boolean {
  if (!from && !to) return true
  if (!paidAt) return false
  const day = formatKstDate(paidAt)
  return (!from || day >= from) && (!to || day <= to)
}

export type PurchaseFilter = { q: string; type: string; center: string; test: string; stage: string; order: string; from: string; to: string }
export const EMPTY_PURCHASE_FILTER: PurchaseFilter = { q: '', type: '', center: '', test: '', stage: '', order: '', from: '', to: '' }
// 배정 센터 거르기에서 "미배정"을 고르는 값
export const CENTER_NONE = '__none__'
// 구매 구분 거르기에서 "미분류"를 고르는 값
export const TYPE_UNCLASSIFIED = '__unclassified__'
// 주문 상태 거르기의 묶음 값: 확인 필요, 취소·반품 진행 중, 네이버 주문 아님
export const ORDER_REVIEW = '__review__'
export const ORDER_CLAIM = '__claim__'
export const ORDER_NONE = '__none__'

function matchOrder(n: NaverSummary | null, f: string): boolean {
  if (!f) return true
  if (f === ORDER_NONE) return !n
  if (!n) return false
  if (f === ORDER_REVIEW) return n.needs_review
  if (f === ORDER_CLAIM) return orderTone(n.product_order_status, n.claim_status) === 'warning'
  return n.product_order_status === f
}

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

export function filterPurchases<T extends Pick<PurchaseRow, 'purchase_type' | 'paid_at' | 'applications' | 'sessions' | 'naver_product_orders'>>(rows: T[], f: PurchaseFilter): T[] {
  const q = f.q.trim().toLowerCase()
  // 연락처는 하이픈 없이 숫자만 맞춰 본다(4자리 이상일 때만, 주문번호 검색과 섞이지 않게 따로)
  const qDigits = digits(q).length >= 4 ? digits(q) : ''
  return rows.filter((r) => {
    const s = mainSession(r)
    const text = [r.applications?.client_name, r.applications?.guardian_name, r.naver_product_orders?.naver_product_order_id]
      .filter(Boolean).join(' ').toLowerCase()
    const phones = [r.applications?.client_phone, r.applications?.guardian_phone].map(digits).filter(Boolean)
    return (!q || text.includes(q) || (!!qDigits && phones.some((p) => p.includes(qDigits))))
      && (!f.type || (f.type === TYPE_UNCLASSIFIED ? r.purchase_type === null : r.purchase_type === f.type))
      && (!f.test || r.applications?.test_name === f.test)
      && matchStage(r, f.stage)
      && (!f.center || (f.center === CENTER_NONE ? !s?.center_id : s?.center_id === f.center))
      && matchOrder(r.naver_product_orders, f.order)
      && matchPeriod(r.paid_at, f.from, f.to)
  })
}

// 목록에 있는 진행 검사 이름(거르기 선택지)
export function testNames(rows: Pick<PurchaseRow, 'applications'>[]): string[] {
  return [...new Set(rows.map((r) => r.applications?.test_name).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'ko'))
}

// 신청서 칸. 직접 등록과 시트 가져오기가 같은 모양을 쓴다(DB 함수 _insert_application 의 jsonb 키와 같다).
export type ApplicationInput = {
  submitted_at: string | null
  client_name: string
  client_phone: string
  client_birth: string
  residence: string
  school: string
  guardian_name: string
  guardian_phone: string
  test_name: string
  counsel_field: string
  reason: string
  preferred_schedule: string
  preferred_method: string
  counseling_experience: string
  expectation: string
  request_note: string
  consent_third_party: boolean
  refund_policy_checked: boolean
  medication_diagnosis: string
  result_file_url: string
  referral_source: string
}

export const EMPTY_APPLICATION: ApplicationInput = {
  submitted_at: null, client_name: '', client_phone: '', client_birth: '', residence: '', school: '',
  guardian_name: '', guardian_phone: '', test_name: '', counsel_field: '', reason: '', preferred_schedule: '',
  preferred_method: '', counseling_experience: '', expectation: '', request_note: '',
  consent_third_party: false, refund_policy_checked: false, medication_diagnosis: '', result_file_url: '', referral_source: '',
}

// 칸별 최대 글자 수. DB CHECK 와 같다.
export const APPLICATION_LIMITS: Partial<Record<keyof ApplicationInput, number>> = {
  client_name: 50, client_phone: 30, client_birth: 30, residence: 100, school: 100, guardian_name: 50, guardian_phone: 30,
  test_name: 100, counsel_field: 200, reason: 2000, preferred_schedule: 500, preferred_method: 50, counseling_experience: 500,
  expectation: 2000, request_note: 2000, medication_diagnosis: 1000, result_file_url: 1000, referral_source: 500,
}

export function overLimitFields(a: ApplicationInput): (keyof ApplicationInput)[] {
  return (Object.keys(APPLICATION_LIMITS) as (keyof ApplicationInput)[])
    .filter((k) => String(a[k] ?? '').trim().length > (APPLICATION_LIMITS[k] ?? Infinity))
}

export type PurchaseInput = {
  purchase_type: PurchaseType
  naver_product_order_id: string
  product_name: string
  test_option: string
  counsel_option: string
  paid_on: string
  purchase_memo: string
  admin_memo: string
  with_application: boolean
  application: ApplicationInput
}

export const EMPTY_PURCHASE_INPUT: PurchaseInput = {
  purchase_type: 'test_main', naver_product_order_id: '', product_name: '', test_option: '', counsel_option: '', paid_on: '',
  purchase_memo: '', admin_memo: '', with_application: true, application: EMPTY_APPLICATION,
}

export type PurchaseInputErrors = Partial<Record<'naver_product_order_id' | 'client_name' | 'application', CopyKey>>

export function validatePurchaseInput(v: PurchaseInput): PurchaseInputErrors {
  const e: PurchaseInputErrors = {}
  const order = v.naver_product_order_id.trim()
  if (order && !/^[0-9]{1,40}$/.test(order)) e.naver_product_order_id = 'purchase.error.orderNoFormat'
  if (v.with_application) {
    if (!v.application.client_name.trim() && !v.application.guardian_name.trim()) e.client_name = 'purchase.error.nameRequired'
    if (overLimitFields(v.application).length > 0) e.application = 'purchase.error.tooLong'
  }
  return e
}
