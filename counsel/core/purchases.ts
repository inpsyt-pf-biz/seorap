// 구매 건·상담 상태 규칙. 허용값은 DB CHECK(20261012000003_purchases_sessions.sql)와 같아야 하고 purchases.test.ts 가 대조한다.
import { t, type CopyKey } from './copy.ko.ts'

// 구매 구분: 현행 구글폼 신청서 4종
export const PURCHASE_TYPES = ['test_main', 'counsel_main', 'sponsored', 'group_buy'] as const
export type PurchaseType = (typeof PURCHASE_TYPES)[number]

// 상담 상태(기획 문서 Step 3의 상태별 건수와 같은 이름)
// 미배정 → 예약 요청(센터에 배정되어 예약을 기다림) → 예약 확정 → 상담 완료. 이탈: 상담 불가, 취소
export const SESSION_STATUSES = ['unassigned', 'requested', 'confirmed', 'completed', 'unable', 'cancelled'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

// 배정·다시 배정을 할 수 있는 상태. DB 함수 rpc_assign_sessions 와 같다.
export const ASSIGNABLE_STATUSES: readonly SessionStatus[] = ['unassigned', 'requested']

export function purchaseTypeLabel(v: string): string {
  return (PURCHASE_TYPES as readonly string[]).includes(v) ? t(`purchase.type.${v}` as CopyKey) : v
}

export function sessionStatusLabel(v: string): string {
  return (SESSION_STATUSES as readonly string[]).includes(v) ? t(`session.status.${v}` as CopyKey) : v
}

export type SessionSummary = { id: string; seq: number; status: SessionStatus; center_id: string | null; scheduled_at: string | null }

export type ApplicationSummary = {
  client_name: string | null
  guardian_name: string | null
  test_name: string | null
  submitted_at: string | null
  residence: string | null
  preferred_method: string | null
  preferred_schedule: string | null
}

export type PurchaseRow = {
  id: string
  purchase_type: PurchaseType
  order_no: string | null
  product_name: string | null
  source: 'manual' | 'sheet_import'
  created_at: string
  applications: ApplicationSummary | null
  sessions: SessionSummary[]
}

export const PURCHASE_LIST_COLUMNS =
  'id, purchase_type, order_no, product_name, source, created_at, '
  + 'applications(client_name, guardian_name, test_name, submitted_at, residence, preferred_method, preferred_schedule), '
  + 'sessions(id, seq, status, center_id, scheduled_at)'

// 목록의 한 줄은 첫 번째 상담을 대표로 보여 준다(지금은 구매 건 1 : 상담 1)
export function mainSession(p: Pick<PurchaseRow, 'sessions'>): SessionSummary | null {
  return [...p.sessions].sort((a, b) => a.seq - b.seq)[0] ?? null
}

// 이름 칸: 내담자 이름, 없으면 보호자 이름
export function clientLabel(p: Pick<PurchaseRow, 'applications'>): string {
  return p.applications?.client_name ?? p.applications?.guardian_name ?? t('center.empty')
}

export type StatusCounts = Record<SessionStatus, number> & { all: number }

export function countByStatus(rows: Pick<PurchaseRow, 'sessions'>[]): StatusCounts {
  const c = Object.fromEntries(SESSION_STATUSES.map((s) => [s, 0])) as Record<SessionStatus, number>
  for (const r of rows) {
    const s = mainSession(r)
    if (s) c[s.status] += 1
  }
  return { ...c, all: rows.length }
}

export type PurchaseFilter = { q: string; type: string; center: string; test: string; status: string }
export const EMPTY_PURCHASE_FILTER: PurchaseFilter = { q: '', type: '', center: '', test: '', status: '' }
// 배정 센터 거르기에서 "미배정"을 고르는 값
export const CENTER_NONE = '__none__'

export function filterPurchases<T extends Pick<PurchaseRow, 'purchase_type' | 'applications' | 'sessions'>>(rows: T[], f: PurchaseFilter): T[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter((r) => {
    const s = mainSession(r)
    const names = [r.applications?.client_name, r.applications?.guardian_name].filter(Boolean).join(' ').toLowerCase()
    return (!q || names.includes(q))
      && (!f.type || r.purchase_type === f.type)
      && (!f.test || r.applications?.test_name === f.test)
      && (!f.status || s?.status === f.status)
      && (!f.center || (f.center === CENTER_NONE ? !s?.center_id : s?.center_id === f.center))
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
  order_no: string
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
  purchase_type: 'test_main', order_no: '', product_name: '', test_option: '', counsel_option: '', paid_on: '',
  purchase_memo: '', admin_memo: '', with_application: true, application: EMPTY_APPLICATION,
}

export type PurchaseInputErrors = Partial<Record<'order_no' | 'client_name' | 'application', CopyKey>>

export function validatePurchaseInput(v: PurchaseInput): PurchaseInputErrors {
  const e: PurchaseInputErrors = {}
  if (v.order_no.trim().length > 40) e.order_no = 'purchase.error.orderNoLength'
  if (v.with_application) {
    if (!v.application.client_name.trim() && !v.application.guardian_name.trim()) e.client_name = 'purchase.error.nameRequired'
    if (overLimitFields(v.application).length > 0) e.application = 'purchase.error.tooLong'
  }
  return e
}
