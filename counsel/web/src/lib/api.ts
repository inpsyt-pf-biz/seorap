// 화면이 DB를 부르는 곳은 이 파일 하나다. 나중에 서랍 어드민의 호출 방식이 달라져도 이 파일만 바꾼다.
import { CENTER_COLUMNS, type Center, type CenterInput } from '@counsel-core/centers.ts'
import { CounselError, toCounselError } from '@counsel-core/errors.ts'
import { PURCHASE_LIST_COLUMNS, type PurchaseInput, type PurchaseRow, type PurchaseType } from '@counsel-core/purchases.ts'
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

export type ApplicationDetail = {
  purchase: { purchase_type: string; order_no: string | null; product_name: string | null; test_option: string | null; counsel_option: string | null; paid_on: string | null; purchase_memo: string | null; admin_memo: string | null }
  application: Record<string, string | boolean | null> | null
  sensitive: { medication_diagnosis: string | null; result_file_url: string | null } | null
  marketing: { referral_source: string | null } | null
}

// 신청서 보기 창용. 민감정보·마케팅 정보는 따로 읽는다(나중에 센터에는 이 둘을 막는다).
export async function getApplicationDetail(purchaseId: string): Promise<ApplicationDetail> {
  const [purchase, application, sensitive, marketing] = await Promise.all([
    run<ApplicationDetail['purchase']>(supabase.from('purchases')
      .select('purchase_type, order_no, product_name, test_option, counsel_option, paid_on, purchase_memo, admin_memo').eq('id', purchaseId).single()),
    run<ApplicationDetail['application']>(supabase.from('applications').select('*').eq('purchase_id', purchaseId).maybeSingle()),
    run<ApplicationDetail['sensitive']>(supabase.from('application_sensitive').select('medication_diagnosis, result_file_url').eq('purchase_id', purchaseId).maybeSingle()),
    run<ApplicationDetail['marketing']>(supabase.from('application_marketing').select('referral_source').eq('purchase_id', purchaseId).maybeSingle()),
  ])
  return { purchase, application, sensitive, marketing }
}

export function createPurchase(v: PurchaseInput): Promise<string> {
  return run<string>(supabase.rpc('rpc_create_purchase', {
    p_purchase_type: v.purchase_type,
    p_order_no: v.order_no,
    p_product_name: v.product_name,
    p_test_option: v.test_option,
    p_counsel_option: v.counsel_option,
    p_paid_on: v.paid_on || null,
    p_purchase_memo: v.purchase_memo,
    p_admin_memo: v.admin_memo,
    p_application: v.with_application ? v.application : null,
  }))
}

export function importApplications(type: PurchaseType, rows: Record<string, unknown>[]): Promise<{ inserted: number; duplicates: number }> {
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
