import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mockCounsel } from '../../_shared/adapters/mock.ts'
import { type Booking, bookingOf, type CounselSessionRow, opensTests } from '../../_shared/core/counselBooking.ts'
import type { Provider } from '../../_shared/core/counselForm.ts'
import type { CounselAdapter, CounselFormRef } from '../../_shared/adapters/types.ts'
import { db, must } from './db.ts'
import { ApiError } from './http.ts'
import type { Settings } from './settings.ts'

// 상담 어드민 DB 의 서랍 전용 함수(rpc_seorap_form_for · rpc_seorap_submit_application · rpc_seorap_counsel_status)를 부르는 진짜 통로.
// 접속값은 함수 비밀값 COUNSEL_URL · COUNSEL_SECRET_KEY. 로컬은 상담 어드민 스택(56321)을 docker 밖으로 부른다
let client: SupabaseClient | null = null
function counselDb(): SupabaseClient {
  if (!client) {
    const url = Deno.env.get('COUNSEL_URL')
    const key = Deno.env.get('COUNSEL_SECRET_KEY')
    if (!url || !key) throw new Error('missing counsel connection')
    client = createClient(url, key, { db: { schema: 'counsel' }, auth: { persistSession: false, autoRefreshToken: false } }) as unknown as SupabaseClient
  }
  return client
}

const realCounsel: CounselAdapter = {
  async formFor(manageCode) {
    const { data, error } = await counselDb().rpc('rpc_seorap_form_for', { p_manage_code: manageCode })
    if (error) throw new Error(`counsel form: ${error.message}`)
    if (!data) return null
    const d = data as { template_id: string; version: number; flow: 'counsel_first'; definition: CounselFormRef['definition']; providers?: Provider[] }
    return { templateId: d.template_id, version: d.version, flow: d.flow, definition: d.definition, providers: d.providers ?? [] }
  },
  async submit(s) {
    const { data, error } = await counselDb().rpc('rpc_seorap_submit_application', { p: s })
    if (error) {
      // 시트로 먼저 들어온 신청서가 원장에 있으면 서랍에서 다시 낼 수 없다 (담당자 확인)
      if (error.message.includes('COUNSEL:ALREADY_HAS_APPLICATION')) throw new ApiError('CONFLICT', { reason: 'already_in_ledger' })
      throw new Error(`counsel submit: ${error.message}`)
    }
    const d = data as { purchase_id: string; created: boolean }
    return { purchaseId: d.purchase_id, created: d.created }
  },
  async status(purchaseIds) {
    if (!purchaseIds.length) return []
    const { data, error } = await counselDb().rpc('rpc_seorap_counsel_status', { p_purchase_ids: purchaseIds })
    if (error) throw new Error(`counsel status: ${error.message}`)
    return (data ?? []) as CounselSessionRow[]
  },
  async help() {
    const { data, error } = await counselDb().rpc('rpc_seorap_help')
    if (error) throw new Error(`counsel help: ${error.message}`)
    return data
  },
}

export function counsel(s: Settings): CounselAdapter {
  return s.counsel_mode === 'mock' ? mockCounsel() : realCounsel
}

// 상담이 든 주문(상품 매핑 includes_counsel)의 상품 줄. 주문마다 하나(첫 상담 상품)만 신청서 대상이다
export type CounselItem = {
  orderId: string; orderItemId: string; productName: string; manageCode: string | null
  naverProductOrderId: string; externalOrderId: string; submittedAt: string | null
  // 제출했을 때 상담 원장의 구매 건, 예약 확정으로 검사 잠금을 푼 시각
  purchaseId: string | null; unlockedAt: string | null
}
export async function counselItems(orderIds: string[]): Promise<CounselItem[]> {
  if (!orderIds.length) return []
  const [items, orders, subs] = await Promise.all([
    db().from('order_items').select('id, order_id, product_name, manage_code, naver_product_order_id, created_at, product_mappings!inner(includes_counsel)')
      .in('order_id', orderIds).eq('product_mappings.includes_counsel', true).order('created_at', { ascending: true }),
    db().from('orders').select('id, external_order_id').in('id', orderIds),
    db().from('counsel_submissions').select('order_id, submitted_at, counsel_purchase_id, unlocked_at').in('order_id', orderIds),
  ])
  const rows = must(items, 'counsel items read') as unknown as
    { id: string; order_id: string; product_name: string; manage_code: string | null; naver_product_order_id: string }[]
  const ext = new Map((must(orders, 'counsel orders read') as { id: string; external_order_id: string }[]).map((o) => [o.id, o.external_order_id]))
  const done = new Map((must(subs, 'counsel submissions read') as { order_id: string; submitted_at: string; counsel_purchase_id: string; unlocked_at: string | null }[])
    .map((x) => [x.order_id, x]))
  const seen = new Set<string>()
  const out: CounselItem[] = []
  for (const r of rows) {
    if (seen.has(r.order_id)) continue
    seen.add(r.order_id)
    out.push({
      orderId: r.order_id, orderItemId: r.id, productName: r.product_name, manageCode: r.manage_code,
      naverProductOrderId: r.naver_product_order_id, externalOrderId: ext.get(r.order_id) ?? '', submittedAt: done.get(r.order_id)?.submitted_at ?? null,
      purchaseId: done.get(r.order_id)?.counsel_purchase_id ?? null, unlockedAt: done.get(r.order_id)?.unlocked_at ?? null,
    })
  }
  return out
}

export type CounselView = CounselItem & { booking: Booking | null; testsOpen: boolean }

// 서랍을 열 때: 신청서를 낸 상담 건의 예약 상태를 상담 어드민에 묻고, 확정·완료면 그 주문의 검사 잠금을 푼다(시나리오 §5-1).
// 상담 어드민에 닿지 못하면 잠금은 그대로 두고 대기로 보인다. 한 번 푼 잠금은 다시 걸지 않는다(E4)
export async function counselViews(orderIds: string[], s: Settings): Promise<{ views: CounselView[]; unlocked: boolean }> {
  const items = await counselItems(orderIds)
  const asked = items.filter((i) => i.purchaseId)
  let rows: CounselSessionRow[] = []
  if (asked.length) {
    try {
      rows = await counsel(s).status(asked.map((i) => i.purchaseId!))
    } catch (e) {
      console.error('counsel status failed', e instanceof Error ? e.message : e)
    }
  }
  let unlocked = false
  const views: CounselView[] = []
  for (const i of items) {
    const booking = i.purchaseId ? bookingOf(rows.filter((r) => r.purchase_id === i.purchaseId)) : null
    let testsOpen = i.unlockedAt !== null
    if (booking && !testsOpen && opensTests(booking)) {
      must(await db().rpc('counsel_unlock', { p_order_id: i.orderId }), 'counsel unlock')
      testsOpen = true
      unlocked = true
    }
    views.push({ ...i, booking, testsOpen })
  }
  return { views, unlocked }
}
