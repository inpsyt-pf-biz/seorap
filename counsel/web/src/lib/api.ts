// 화면이 DB를 부르는 곳은 이 파일 하나다. 나중에 서랍 어드민의 호출 방식이 달라져도 이 파일만 바꾼다.
import { CENTER_COLUMNS, type Center, type CenterInput } from '@counsel-core/centers.ts'
import { CounselError, toCounselError } from '@counsel-core/errors.ts'
import { NAVER_ORDER_COLUMNS, type NaverOrderInfo, type NaverOrdererMasked, type NaverSettlement } from '@counsel-core/naverOrder.ts'
import { PURCHASE_TEST_COLUMNS, type PurchaseTest } from '@counsel-core/exams.ts'
import type { FormLink, FormTemplateDetail, FormTemplateRow } from '@counsel-core/forms.ts'
import { INBOX_COLUMNS, type InboxItem } from '@counsel-core/inbox.ts'
import type { FormDefinition } from '@seorap-core/counselForm.ts'
import { PURCHASE_LIST_COLUMNS, type PurchaseInput, type PurchaseRow, type PurchaseType, type SessionStatus } from '@counsel-core/purchases.ts'
import { SESSION_EVENT_COLUMNS, type SessionAction, type SessionEvent } from '@counsel-core/sessions.ts'
import type { MyContext } from '../shell/session'
import { supabase } from '../shell/supabaseClient'

async function run<T>(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await request
  if (error) throw toCounselError(error)
  return data as T
}

export function getMyContext(): Promise<MyContext> {
  return run<MyContext>(supabase.rpc('my_context'))
}

// 본사 행은 센터 목록에 보이지 않는다. 상담 완료/배정 건수는 장부에서 센 값(center_stats)을 붙인다.
export async function listCenters(): Promise<Center[]> {
  const [centers, stats] = await Promise.all([
    run<Center[]>(supabase.from('centers').select(CENTER_COLUMNS).eq('is_headquarters', false).order('name')),
    run<{ center_id: string; assigned_count: number; completed_count: number }[]>(
      supabase.from('center_stats').select('center_id, assigned_count, completed_count'),
    ),
  ])
  const byId = new Map(stats.map((s) => [s.center_id, s]))
  return centers.map((c) => ({ ...c, assigned_count: byId.get(c.id)?.assigned_count ?? 0, completed_count: byId.get(c.id)?.completed_count ?? 0 }))
}

export function listPurchases(): Promise<PurchaseRow[]> {
  return run<PurchaseRow[]>(supabase.from('purchases').select(PURCHASE_LIST_COLUMNS).order('created_at', { ascending: false }))
}

export type PurchaseDetail = {
  purchase: {
    purchase_type: PurchaseType | null; source: string; product_name: string | null; test_option: string | null; counsel_option: string | null
    paid_at: string | null; purchase_memo: string | null; admin_memo: string | null; version: number; created_at: string
  }
  application: Record<string, string | boolean | null> | null
  sensitive: { medication_diagnosis: string | null; result_file_url: string | null; extra: AnswerItem[] } | null
  marketing: { referral_source: string | null } | null
  // 서랍에서 낸 신청서의 템플릿·판과 원장 칸에 연결되지 않은 답 (서랍 B2)
  answers: { template_id: string; template_name: string; template_version: number; extra: AnswerItem[] } | null
  naver: NaverOrderInfo | null
  orderer: NaverOrdererMasked | null
  // 관리자가 아니면 DB가 0행을 돌려준다
  settlement: NaverSettlement | null
  sessions: SessionDetail[]
  events: SessionEvent[]
  notes: PurchaseNote[]
  // 구매자 아래 검사들(실시 상태·응시자·결과지)
  tests: PurchaseTest[]
  // 기록·메모를 남긴 사람의 이름(user id → 이름)
  names: Record<string, string>
}

export type SessionDetail = {
  id: string
  seq: number
  status: SessionStatus
  center_id: string | null
  scheduled_at: string | null
  method: string | null
  assigned_at: string | null
  version: number
}

export type PurchaseNote = { id: number; body: string; author: string | null; created_at: string }
export type AnswerItem = { id: string; label: string; value: string }

// 구매 건 상세 페이지용. 민감정보·마케팅·주문자·정산은 표를 나눠 두고 따로 읽는다(볼 수 있는 사람이 다르다).
export async function getPurchaseDetail(purchaseId: string): Promise<PurchaseDetail> {
  const [purchase, application, sensitive, marketing, naver, orderer, settlement, sessions, notes, tests, answerRow] = await Promise.all([
    run<PurchaseDetail['purchase']>(supabase.from('purchases')
      .select('purchase_type, source, product_name, test_option, counsel_option, paid_at, purchase_memo, admin_memo, version, created_at').eq('id', purchaseId).single()),
    run<PurchaseDetail['application']>(supabase.from('applications').select('*').eq('purchase_id', purchaseId).maybeSingle()),
    run<PurchaseDetail['sensitive']>(supabase.from('application_sensitive').select('medication_diagnosis, result_file_url, extra').eq('purchase_id', purchaseId).maybeSingle()),
    run<PurchaseDetail['marketing']>(supabase.from('application_marketing').select('referral_source').eq('purchase_id', purchaseId).maybeSingle()),
    run<PurchaseDetail['naver']>(supabase.from('naver_product_orders').select(NAVER_ORDER_COLUMNS).eq('purchase_id', purchaseId).maybeSingle()),
    run<PurchaseDetail['orderer']>(supabase.from('naver_orderers').select('name_masked, tel_masked').eq('purchase_id', purchaseId).maybeSingle()),
    run<PurchaseDetail['settlement']>(supabase.from('naver_settlements')
      .select('expected_settlement_amount, payment_commission, channel_commission, sale_commission, shopping_interlock_commission').eq('purchase_id', purchaseId).maybeSingle()),
    run<SessionDetail[]>(supabase.from('sessions')
      .select('id, seq, status, center_id, scheduled_at, method, assigned_at, version').eq('purchase_id', purchaseId).order('seq')),
    run<PurchaseNote[]>(supabase.from('purchase_notes').select('id, body, author, created_at').eq('purchase_id', purchaseId).order('created_at', { ascending: false })),
    run<PurchaseTest[]>(supabase.from('purchase_tests').select(PURCHASE_TEST_COLUMNS).eq('purchase_id', purchaseId).order('unit_no').order('created_at')),
    run<{ template_id: string; template_version: number; extra: AnswerItem[]; form_templates: { name: string } } | null>(
      supabase.from('application_answers').select('template_id, template_version, extra, form_templates(name)').eq('purchase_id', purchaseId).maybeSingle(),
    ),
  ])
  const answers = answerRow
    ? { template_id: answerRow.template_id, template_name: answerRow.form_templates.name, template_version: answerRow.template_version, extra: answerRow.extra }
    : null
  const events = sessions.length === 0 ? [] : await run<SessionEvent[]>(supabase.from('session_events')
    .select(SESSION_EVENT_COLUMNS).in('session_id', sessions.map((x) => x.id)).order('at', { ascending: false }).order('id', { ascending: false }))
  const people = [...new Set([...events.map((e) => e.actor), ...notes.map((n) => n.author)].filter((x): x is string => !!x))]
  const profiles = people.length === 0 ? [] : await run<{ user_id: string; display_name: string }[]>(
    supabase.from('profiles').select('user_id, display_name').in('user_id', people),
  )
  const names = Object.fromEntries(profiles.map((x) => [x.user_id, x.display_name]))
  return { purchase, application, sensitive, marketing, answers, naver, orderer, settlement, sessions, events, notes, tests, names }
}

// 신청서 템플릿 (서랍 B2). 쓰기는 DB 함수로만, 판은 고칠 수 없다
export async function listFormTemplates(): Promise<FormTemplateRow[]> {
  const [templates, links] = await Promise.all([
    run<Omit<FormTemplateRow, 'link_count'>[]>(supabase.from('form_templates').select('id, name, published_version, version, updated_at').order('name')),
    run<{ template_id: string }[]>(supabase.from('form_product_links').select('template_id')),
  ])
  return templates.map((x) => ({ ...x, link_count: links.filter((l) => l.template_id === x.id).length }))
}

export function getFormTemplate(id: string): Promise<FormTemplateDetail> {
  return run<FormTemplateDetail>(supabase.from('form_templates').select('id, name, draft, published_version, version').eq('id', id).single())
}

export function createFormTemplate(name: string, draft: FormDefinition): Promise<string> {
  return run<string>(supabase.rpc('rpc_create_form_template', { p_name: name, p_draft: draft }))
}

export function duplicateFormTemplate(id: string, name: string): Promise<string> {
  return run<string>(supabase.rpc('rpc_duplicate_form_template', { p_id: id, p_name: name }))
}

export function saveFormDraft(id: string, version: number, name: string | null, draft: FormDefinition): Promise<number> {
  return run<number>(supabase.rpc('rpc_save_form_draft', { p_id: id, p_version: version, p_name: name, p_draft: draft }))
}

export function publishFormTemplate(id: string, version: number): Promise<number> {
  return run<number>(supabase.rpc('rpc_publish_form_template', { p_id: id, p_version: version }))
}

export function listFormLinks(): Promise<FormLink[]> {
  return run<FormLink[]>(supabase.from('form_product_links').select('manage_code, template_id, purchase_type, flow, enabled, label').order('manage_code'))
}

export async function setFormLink(l: Omit<FormLink, 'flow'>): Promise<void> {
  await run(supabase.rpc('rpc_set_form_link', {
    p_manage_code: l.manage_code, p_template_id: l.template_id, p_purchase_type: l.purchase_type, p_enabled: l.enabled, p_label: l.label,
  }))
}

export function updateSession(
  sessionId: string, version: number, action: SessionAction, scheduledAt: string | null, method: string | null, reason: string,
): Promise<number> {
  return run<number>(supabase.rpc('rpc_update_session', {
    p_session_id: sessionId, p_version: version, p_action: action, p_scheduled_at: scheduledAt, p_method: method, p_reason: reason,
  }))
}

export function addPurchaseNote(purchaseId: string, body: string): Promise<number> {
  return run<number>(supabase.rpc('rpc_add_purchase_note', { p_purchase_id: purchaseId, p_body: body }))
}

export function listInbox(): Promise<InboxItem[]> {
  return run<InboxItem[]>(supabase.from('application_inbox').select(INBOX_COLUMNS).eq('status', 'waiting').order('created_at'))
}

export async function countInbox(): Promise<number> {
  const { count, error } = await supabase.from('application_inbox').select('id', { count: 'exact', head: true }).eq('status', 'waiting')
  if (error) throw toCounselError(error)
  return count ?? 0
}

export async function attachInbox(inboxId: string, purchaseId: string): Promise<void> {
  await run(supabase.rpc('rpc_attach_inbox', { p_inbox_id: inboxId, p_purchase_id: purchaseId }))
}

export function createFromInbox(inboxIds: string[]): Promise<number> {
  return run<number>(supabase.rpc('rpc_create_from_inbox', { p_inbox_ids: inboxIds }))
}

export function dismissInbox(inboxIds: string[]): Promise<number> {
  return run<number>(supabase.rpc('rpc_dismiss_inbox', { p_inbox_ids: inboxIds }))
}

// 상품주문번호로 신청서가 아직 없는 구매 건을 찾는다(대기함에서 붙일 건 찾기)
export async function findPurchaseByOrderId(orderId: string): Promise<string | null> {
  const rows = await run<{ purchase_id: string; purchases: { applications: unknown } | null }[]>(supabase.from('naver_product_orders')
    .select('purchase_id, purchases(applications(purchase_id))').eq('naver_product_order_id', orderId.replace(/[\s-]/g, '')))
  const hit = rows.find((r) => !r.purchases?.applications)
  return hit?.purchase_id ?? null
}

export type CenterSession = {
  id: string
  seq: number
  status: SessionStatus
  scheduled_at: string | null
  assigned_at: string | null
  purchase_id: string
  purchases: {
    purchase_type: PurchaseType | null
    applications: { client_name: string | null; guardian_name: string | null } | null
    naver_orderers: { name_masked: string | null } | null
  } | null
}

export function listCenterSessions(centerId: string): Promise<CenterSession[]> {
  return run<CenterSession[]>(supabase.from('sessions')
    .select('id, seq, status, scheduled_at, assigned_at, purchase_id, purchases(purchase_type, applications(client_name, guardian_name), naver_orderers(name_masked))')
    .eq('center_id', centerId).order('assigned_at', { ascending: false }))
}

export type Counselor = { id: string; name: string; memo: string | null; active: boolean; version: number }

export function listCounselors(centerId: string): Promise<Counselor[]> {
  return run<Counselor[]>(supabase.from('center_counselors').select('id, name, memo, active, version').eq('center_id', centerId).order('name'))
}

export function saveCounselor(centerId: string, c: { id: string | null; version: number; name: string; memo: string; active: boolean }): Promise<string> {
  return run<string>(supabase.rpc('rpc_save_counselor', {
    p_id: c.id, p_version: c.version, p_center_id: centerId, p_name: c.name, p_memo: c.memo, p_active: c.active,
  }))
}

export function setPurchaseType(purchaseId: string, version: number, type: PurchaseType): Promise<number> {
  return run<number>(supabase.rpc('rpc_set_purchase_type', { p_purchase_id: purchaseId, p_version: version, p_purchase_type: type }))
}

export async function resolveNaverReview(purchaseId: string): Promise<void> {
  await run(supabase.rpc('rpc_resolve_naver_review', { p_purchase_id: purchaseId }))
}

export function createPurchase(v: PurchaseInput): Promise<string> {
  return run<string>(supabase.rpc('rpc_create_purchase', {
    p_purchase_type: v.purchase_type,
    p_naver_product_order_id: v.naver_product_order_id,
    p_product_name: v.product_name,
    p_test_option: v.test_option,
    p_counsel_option: v.counsel_option,
    // 결제일만 고르면 그날 0시(한국 시각)로 둔다
    p_paid_at: v.paid_on ? `${v.paid_on}T00:00:00+09:00` : null,
    p_purchase_memo: v.purchase_memo,
    p_admin_memo: v.admin_memo,
    p_application: v.with_application ? v.application : null,
  }))
}

export function importApplications(type: PurchaseType, rows: Record<string, unknown>[]): Promise<{ attached: number; waiting: number; duplicates: number }> {
  return run(supabase.rpc('rpc_import_applications', { p_purchase_type: type, p_rows: rows }))
}

export function assignSessions(sessionIds: string[], centerId: string, note: string): Promise<{ assigned: number; skipped: number }> {
  return run(supabase.rpc('rpc_assign_sessions', { p_session_ids: sessionIds, p_center_id: centerId, p_note: note }))
}

export async function getCenter(id: string): Promise<Center> {
  const c = await run<Center | null>(
    supabase.from('centers').select(CENTER_COLUMNS).eq('id', id).eq('is_headquarters', false).maybeSingle(),
  )
  if (!c) throw new CounselError('NOT_FOUND')
  return c
}

function centerParams(v: CenterInput) {
  return {
    p_name: v.name,
    p_status: v.status,
    p_location_sido: v.location_sido,
    p_location_sigungu: v.location_sigungu,
    p_latitude: v.latitude,
    p_longitude: v.longitude,
    p_target_groups: v.target_groups,
    p_specialties: v.specialties,
    p_regions: v.regions,
    p_delivery_modes: v.delivery_modes,
    p_phone: v.phone,
    p_address: v.address,
    p_operating_hours: v.operating_hours,
    p_contact_name: v.contact_name,
    p_contact_phone: v.contact_phone,
    p_contract_from: v.contract_from || null,
    p_contract_to: v.contract_to || null,
    p_memo: v.memo,
  }
}

export function createCenter(v: CenterInput): Promise<string> {
  return run<string>(supabase.rpc('rpc_create_center', centerParams(v)))
}

// 화면이 읽어 간 version 을 함께 보낸다. 그 사이 다른 사람이 고쳤으면 VERSION_CONFLICT 로 거부된다.
export function updateCenter(id: string, version: number, v: CenterInput): Promise<number> {
  return run<number>(supabase.rpc('rpc_update_center', { p_id: id, p_version: version, ...centerParams(v) }))
}
