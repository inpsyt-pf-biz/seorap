// 체험판 전용: 화면이 부르는 DB 쓰기 함수(counsel.rpc_*)를 메모리 속 표로 흉내 낸다.
// 규칙의 정본은 supabase/migrations 의 SQL 이다. 같은 순서로 검사하고, 같은 오류 코드를 던지고, 같은 기록(상담 기록·메모·대기함)을 남긴다.
// 줄마다 지키는 CHECK(글자 수·형식)는 화면에서 고를 수 있는 값 위주로만 옮겼다.
import type { Row } from './query'
import type { DemoDb } from './store'

export class RpcError extends Error {
  readonly detail: string | null
  constructor(code: string, detail: string | null = null) {
    super(`COUNSEL:${code}`)
    this.detail = detail
  }
}

const fail = (code: string, detail: string | null = null): never => {
  throw new RpcError(code, detail)
}

const now = () => new Date().toISOString()

// file:// 로 연 창에서는 crypto.randomUUID 가 없을 수 있어 직접 만든다
export function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// counsel_private._blank_to_null: 앞뒤 공백을 지우고, 비면 빈칸
const blank = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
const tooLong = (v: unknown, max: number) => typeof v === 'string' && [...v].length > max
// counsel_private._dedupe: 빈칸을 빼고 겹친 값을 하나로, 정렬
const dedupe = (v: unknown): string[] =>
  [...new Set(((v as (string | null)[] | null) ?? []).filter((x): x is string => x !== null))].sort()
const toIso = (v: unknown, field: string): string | null => {
  if (v === null || v === undefined) return null
  const t = Date.parse(String(v))
  return Number.isNaN(t) ? fail('INVALID_INPUT', field) : new Date(t).toISOString()
}
const toBool = (v: unknown) => v === true || ['t', 'true', 'y', 'yes', 'on', '1'].includes(String(v ?? '').toLowerCase())

// 짧은 해시(FNV-1a 32비트). 체험판 중복 판정에만 쓴다
const fnv1a = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

const tbl = (db: DemoDb, name: string): Row[] => (db.tables[name] ??= [])
const uid = (db: DemoDb) => db.context.user_id
const need = (db: DemoDb, cap: string) => {
  if (!db.context.caps.includes(cap)) fail('FORBIDDEN')
}
// counsel_private.touch_version: 고칠 때마다 version 을 1 올린다
const touch = (row: Row) => {
  row.version = (row.version as number) + 1
  row.updated_at = now()
}
const nextId = (rows: Row[]) => rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1

const PURCHASE_TYPES = ['test_main', 'counsel_main', 'sponsored', 'group_buy']
const NAVER_FIELDS = [
  'external_order_id', 'ordered_at', 'naver_product_id', 'original_product_id', 'item_no', 'seller_product_code', 'option_name', 'quantity',
  'remain_quantity', 'payment_amount', 'remain_payment_amount', 'product_order_status', 'claim_type', 'claim_status', 'claim_requested_at',
  'place_order_status', 'decided_at', 'gift_receiving_status', 'inflow_path', 'closed_at', 'review_reason', 'last_received_at',
]
const APP_TEXT: [string, number][] = [
  ['client_name', 50], ['client_phone', 30], ['client_birth', 30], ['residence', 100], ['school', 100], ['guardian_name', 50],
  ['guardian_phone', 30], ['test_name', 100], ['counsel_field', 200], ['reason', 2000], ['preferred_schedule', 500], ['preferred_method', 50],
  ['counseling_experience', 500], ['expectation', 2000], ['request_note', 2000],
]
const INBOX_CLEAR = {
  payload: null, client_name: null, guardian_name: null, client_phone: null, guardian_phone: null, test_name: null, naver_product_order_id: null,
}

function addEvent(db: DemoDb, e: Row) {
  const events = tbl(db, 'session_events')
  events.push({
    id: nextId(events), at: now(), actor: uid(db), from_status: null, to_status: null, from_center: null, to_center: null,
    from_scheduled_at: null, to_scheduled_at: null, note: null, ...e,
  })
}

// counsel_private._insert_application: 신청서 한 건을 세 표(신청서·민감정보·마케팅)에 나눠 넣는다
function insertApplication(db: DemoDb, purchaseId: string, a: unknown) {
  if (a === null || a === undefined) return
  if (typeof a !== 'object' || Array.isArray(a)) fail('INVALID_INPUT', 'application must be an object')
  const x = a as Row
  const row: Row = { purchase_id: purchaseId, submitted_at: toIso(x.submitted_at, 'submitted_at') }
  for (const [k, max] of APP_TEXT) {
    const v = blank(x[k])
    if (tooLong(v, max)) fail('INVALID_INPUT', k)
    row[k] = v
  }
  row.consent_third_party = toBool(x.consent_third_party)
  row.refund_policy_checked = toBool(x.refund_policy_checked)
  row.created_at = now()
  tbl(db, 'applications').push(row)
  const medication = blank(x.medication_diagnosis)
  const resultUrl = blank(x.result_file_url)
  if (medication !== null || resultUrl !== null) {
    tbl(db, 'application_sensitive').push({ purchase_id: purchaseId, medication_diagnosis: medication, result_file_url: resultUrl, created_at: now() })
  }
  const referral = blank(x.referral_source)
  if (referral !== null) tbl(db, 'application_marketing').push({ purchase_id: purchaseId, referral_source: referral, created_at: now() })
}

// purchases 표의 글자 수 CHECK
const PURCHASE_TEXT: [string, number][] = [['product_name', 200], ['test_option', 200], ['counsel_option', 200], ['purchase_memo', 1000], ['admin_memo', 2000]]
const checkPurchaseText = (v: Row) => {
  for (const [k, max] of PURCHASE_TEXT) if (tooLong(v[k], max)) fail('INVALID_INPUT', k)
}

function newPurchase(db: DemoDb, v: Row): string {
  checkPurchaseText(v)
  const id = uuid()
  tbl(db, 'purchases').push({
    id, purchase_type: null, product_name: null, test_option: null, counsel_option: null, paid_at: null, purchase_memo: null, admin_memo: null,
    source: 'manual', source_ref: null, version: 1, created_at: now(), created_by: uid(db), updated_at: now(), updated_by: uid(db), ...v,
  })
  return id
}

function newNaverOrder(db: DemoDb, purchaseId: string, productOrderId: string) {
  tbl(db, 'naver_product_orders').push({
    ...Object.fromEntries(NAVER_FIELDS.map((k) => [k, null])), purchase_id: purchaseId, naver_product_order_id: productOrderId,
    sessions_per_unit: 1, needs_review: false, version: 1, created_at: now(), updated_at: now(),
  })
}

// 상담 1회(미배정)와 첫 기록
function newSession(db: DemoDb, purchaseId: string, kind: 'created' | 'imported') {
  const id = uuid()
  tbl(db, 'sessions').push({
    id, purchase_id: purchaseId, seq: 1, status: 'unassigned', center_id: null, assigned_at: null, assigned_by: null, scheduled_at: null,
    method: null, cost: null, version: 1, created_at: now(), updated_at: now(), updated_by: uid(db),
  })
  addEvent(db, { session_id: id, kind, to_status: 'unassigned' })
}

// counsel_private._attach_application: 신청서를 넣고, 비어 있는 구매 칸만 채우고, 담당자 메모는 덧붙인다
function attachApplication(db: DemoDb, purchaseId: string, purchaseType: string, r: Row) {
  insertApplication(db, purchaseId, r.application)
  const p = tbl(db, 'purchases').find((x) => x.id === purchaseId)!
  p.purchase_type = p.purchase_type ?? purchaseType
  p.test_option = p.test_option ?? blank(r.test_option)
  p.counsel_option = p.counsel_option ?? blank(r.counsel_option)
  p.purchase_memo = p.purchase_memo ?? blank(r.purchase_memo)
  p.admin_memo = [p.admin_memo as string | null, blank(r.admin_memo)].filter((x) => x !== null).join('\n') || null
  checkPurchaseText(p)
  p.updated_by = uid(db)
  touch(p)
}

// counsel_private._create_from_row: 시트 한 줄로 새 구매 건(+신청서, 상품주문번호, 상담 1회)
function createFromRow(db: DemoDb, purchaseType: string, sourceRef: string, r: Row): string {
  const order = blank(r.naver_product_order_id)
  const id = newPurchase(db, {
    purchase_type: purchaseType, test_option: blank(r.test_option), counsel_option: blank(r.counsel_option),
    purchase_memo: blank(r.purchase_memo), admin_memo: blank(r.admin_memo), source: 'sheet_import', source_ref: sourceRef,
  })
  insertApplication(db, id, r.application)
  if (order !== null && /^[0-9]{1,40}$/.test(order) && !tbl(db, 'naver_product_orders').some((n) => n.naver_product_order_id === order)) {
    newNaverOrder(db, id, order)
  }
  newSession(db, id, 'imported')
  return id
}

const PHONE = /^[0-9-]{8,20}$/
const CENTER_TEXT: [string, number][] = [['address', 200], ['contact_name', 30], ['memo', 500], ['operating_hours', 100]]

function centerFields(p: Record<string, unknown>): Row {
  const v: Row = {
    name: typeof p.p_name === 'string' ? p.p_name.trim() : '',
    location_sido: blank(p.p_location_sido), location_sigungu: blank(p.p_location_sigungu),
    latitude: p.p_latitude ?? null, longitude: p.p_longitude ?? null,
    target_groups: dedupe(p.p_target_groups), specialties: dedupe(p.p_specialties), regions: dedupe(p.p_regions), delivery_modes: dedupe(p.p_delivery_modes),
    phone: blank(p.p_phone), address: blank(p.p_address), operating_hours: blank(p.p_operating_hours),
    contact_name: blank(p.p_contact_name), contact_phone: blank(p.p_contact_phone),
    contract_from: p.p_contract_from ?? null, contract_to: p.p_contract_to ?? null, memo: blank(p.p_memo),
  }
  const name = v.name as string
  if (name.length < 1 || [...name].length > 60) fail('INVALID_INPUT', 'name')
  for (const k of ['phone', 'contact_phone']) if (v[k] !== null && !PHONE.test(v[k] as string)) fail('INVALID_INPUT', k)
  for (const [k, max] of CENTER_TEXT) if (tooLong(v[k] as string | null, max)) fail('INVALID_INPUT', k)
  if (v.contract_from && v.contract_to && String(v.contract_from) > String(v.contract_to)) fail('INVALID_INPUT', 'contract period')
  return v
}

const sameName = (db: DemoDb, name: string, exceptId: unknown) =>
  tbl(db, 'centers').some((c) => c.id !== exceptId && String(c.name).toLowerCase() === name.toLowerCase())

type Params = Record<string, unknown>

export const RPC: Record<string, (db: DemoDb, p: Params) => unknown> = {
  my_context: (db) => db.context,

  // 미배정·예약 요청·상담 불가 회차를 운영 중인 센터에 배정(같은 센터면 건너뜀). 배정하면 예약 요청이 되고 예약 일시는 지운다
  rpc_assign_sessions(db, p) {
    need(db, 'session.assign')
    const centerId = p.p_center_id
    if (!tbl(db, 'centers').some((c) => c.id === centerId && !c.is_headquarters && c.status === 'active')) fail('CENTER_NOT_ASSIGNABLE')
    if (tooLong((p.p_note as string | null) ?? null, 500)) fail('INVALID_INPUT', 'note too long')
    const ids = (p.p_session_ids as string[] | null) ?? []
    let assigned = 0
    let skipped = 0
    const targets = tbl(db, 'sessions').filter((s) => ids.includes(s.id as string)).sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
    for (const s of targets) {
      if (!['unassigned', 'requested', 'unable'].includes(s.status as string) || s.center_id === centerId) {
        skipped++
        continue
      }
      const before = { status: s.status, center: s.center_id ?? null }
      Object.assign(s, { status: 'requested', center_id: centerId, scheduled_at: null, assigned_at: now(), assigned_by: uid(db), updated_by: uid(db) })
      touch(s)
      addEvent(db, {
        session_id: s.id, kind: before.center === null ? 'assigned' : 'reassigned', from_status: before.status, to_status: 'requested',
        from_center: before.center, to_center: centerId, note: blank(p.p_note),
      })
      assigned++
    }
    skipped += ids.length - assigned - skipped
    return { assigned, skipped }
  },

  // 상담 진행 바꾸기. 할 수 있는 일은 상태마다 정해져 있다(core/sessions.ts 와 같다)
  rpc_update_session(db, p) {
    need(db, 'session.manage')
    const s = tbl(db, 'sessions').find((x) => x.id === p.p_session_id) ?? fail('NOT_FOUND')
    if (s.version !== p.p_version) fail('VERSION_CONFLICT')
    const reason = blank(p.p_reason)
    const method = (p.p_method as string | null) ?? null
    if (tooLong(reason, 500) || (method !== null && !['offline', 'online'].includes(method))) fail('INVALID_INPUT', 'reason or method')
    const action = String(p.p_action)
    const from = s.status as string
    const to =
      action === 'confirm' && from === 'requested' ? 'confirmed'
      : action === 'reschedule' && from === 'confirmed' ? 'confirmed'
      : action === 'complete' && from === 'confirmed' ? 'completed'
      : action === 'unable' && ['requested', 'confirmed'].includes(from) ? 'unable'
      : action === 'cancel' && ['unassigned', 'requested', 'confirmed', 'unable'].includes(from) ? 'cancelled'
      : ['confirm', 'reschedule', 'complete', 'unable', 'cancel'].includes(action) ? fail('INVALID_TRANSITION')
      : fail('INVALID_INPUT', 'action')
    const schedule = action === 'confirm' || action === 'reschedule'
    const at = toIso(p.p_scheduled_at, 'scheduled_at')
    if ((schedule && at === null) || (['reschedule', 'unable', 'cancel'].includes(action) && reason === null)) {
      fail('INVALID_INPUT', 'scheduled_at or reason required')
    }
    const before = { center: s.center_id ?? null, scheduled: s.scheduled_at ?? null }
    s.status = to
    if (schedule) {
      s.scheduled_at = at
      s.method = method ?? s.method
    }
    s.updated_by = uid(db)
    touch(s)
    addEvent(db, {
      session_id: s.id, kind: action === 'reschedule' ? 'rescheduled' : 'status_changed', from_status: from, to_status: to,
      from_center: before.center, to_center: before.center, from_scheduled_at: before.scheduled, to_scheduled_at: schedule ? at : before.scheduled,
      note: reason,
    })
    return s.version
  },

  // 건 메모. 덧붙이기만 된다
  rpc_add_purchase_note(db, p) {
    need(db, 'note.write')
    const body = blank(p.p_body)
    if (body === null || tooLong(body, 1000)) fail('INVALID_INPUT', 'body')
    if (!tbl(db, 'purchases').some((x) => x.id === p.p_purchase_id)) fail('NOT_FOUND')
    const notes = tbl(db, 'purchase_notes')
    const id = nextId(notes)
    notes.push({ id, purchase_id: p.p_purchase_id, body, author: uid(db), created_at: now() })
    return id
  },

  rpc_set_purchase_type(db, p) {
    need(db, 'purchase.manage')
    if (!PURCHASE_TYPES.includes(p.p_purchase_type as string)) fail('INVALID_INPUT', 'purchase_type')
    const row = tbl(db, 'purchases').find((x) => x.id === p.p_purchase_id) ?? fail('NOT_FOUND')
    if (row.version !== p.p_version) fail('VERSION_CONFLICT')
    row.purchase_type = p.p_purchase_type
    row.updated_by = uid(db)
    touch(row)
    return row.version
  },

  // '확인 필요' 표시를 사람이 센터와 확인한 뒤 내린다
  rpc_resolve_naver_review(db, p) {
    need(db, 'purchase.manage')
    const n = tbl(db, 'naver_product_orders').find((x) => x.purchase_id === p.p_purchase_id && x.needs_review) ?? fail('NOT_FOUND')
    n.needs_review = false
    n.review_reason = null
    touch(n)
    return null
  },

  // 구매 건 직접 등록. 신청서는 없어도 된다. 상담 1회(미배정)가 함께 생긴다
  rpc_create_purchase(db, p) {
    need(db, 'purchase.manage')
    if (p.p_purchase_type === null || p.p_purchase_type === undefined) fail('INVALID_INPUT', 'purchase_type required')
    if (!PURCHASE_TYPES.includes(p.p_purchase_type as string)) fail('INVALID_INPUT', 'purchase_type')
    const order = blank(p.p_naver_product_order_id)
    if (order !== null && !/^[0-9]{1,40}$/.test(order)) fail('INVALID_INPUT', 'naver_product_order_id')
    if (order !== null && tbl(db, 'naver_product_orders').some((n) => n.naver_product_order_id === order)) fail('DUPLICATE_ORDER')
    const id = newPurchase(db, {
      purchase_type: p.p_purchase_type, product_name: blank(p.p_product_name), test_option: blank(p.p_test_option),
      counsel_option: blank(p.p_counsel_option), paid_at: toIso(p.p_paid_at, 'paid_at'), purchase_memo: blank(p.p_purchase_memo),
      admin_memo: blank(p.p_admin_memo), source: 'manual',
    })
    if (order !== null) newNaverOrder(db, id, order)
    insertApplication(db, id, p.p_application)
    newSession(db, id, 'created')
    return id
  },

  // 구글시트 가져오기: 이미 가져온 줄은 건너뛰고, 상품주문번호가 맞고 신청서가 없는 구매 건이면 붙이고, 나머지는 신청서 대기함으로
  rpc_import_applications(db, p) {
    need(db, 'purchase.manage')
    const type = p.p_purchase_type as string | null
    const rows = p.p_rows
    if (!Array.isArray(rows) || type === null || !PURCHASE_TYPES.includes(type)) fail('INVALID_INPUT', 'rows must be an array')
    let attached = 0
    let waiting = 0
    let duplicates = 0
    ;(rows as Row[]).forEach((r, i) => {
      try {
        // 실제 DB는 source_key(응답 시각·연락처·이름)의 md5 를 남긴다. 체험판도 원문 대신 해시만 남긴다
        const ref = `${type}:demo:${fnv1a(String(r?.source_key ?? ''))}`
        if (tbl(db, 'application_inbox').some((x) => x.source_ref === ref) || tbl(db, 'purchases').some((x) => x.source_ref === ref)) {
          duplicates++
          return
        }
        const a = r?.application
        if (typeof a !== 'object' || a === null || Array.isArray(a)) fail('INVALID_INPUT', 'application')
        const app = a as Row
        const order = blank(r.naver_product_order_id)
        const hit = order === null ? undefined : tbl(db, 'naver_product_orders').find((n) =>
          n.naver_product_order_id === order && !tbl(db, 'applications').some((x) => x.purchase_id === n.purchase_id))
        const base = { id: uuid(), purchase_type: type, source_ref: ref, resolved_purchase_id: null, resolved_by: null, resolved_at: null, created_at: now() }
        if (hit) {
          attachApplication(db, hit.purchase_id as string, type!, r)
          tbl(db, 'application_inbox').push({
            ...base, ...INBOX_CLEAR, submitted_at: null, status: 'attached', resolved_purchase_id: hit.purchase_id, resolved_by: uid(db), resolved_at: now(),
          })
          attached++
        } else {
          // application_inbox 표의 글자 수 CHECK
          for (const [k, v, max] of [
            ['client_name', app.client_name, 50], ['guardian_name', app.guardian_name, 50], ['client_phone', app.client_phone, 30],
            ['guardian_phone', app.guardian_phone, 30], ['test_name', app.test_name, 100], ['naver_product_order_id', order, 40],
          ] as const) if (tooLong(blank(v), max)) fail('INVALID_INPUT', k)
          tbl(db, 'application_inbox').push({
            ...base, status: 'waiting', submitted_at: toIso(app.submitted_at, 'submitted_at'), client_name: blank(app.client_name),
            guardian_name: blank(app.guardian_name), client_phone: blank(app.client_phone), guardian_phone: blank(app.guardian_phone),
            test_name: blank(app.test_name), naver_product_order_id: order, payload: structuredClone(r),
          })
          waiting++
        }
      } catch (e) {
        if (e instanceof RpcError) throw new RpcError(e.message.replace('COUNSEL:', ''), `row ${i + 1}: ${e.detail ?? ''}`)
        throw e
      }
    })
    return { attached, waiting, duplicates }
  },

  // 대기함 한 줄을 고른 구매 건에 붙인다
  rpc_attach_inbox(db, p) {
    need(db, 'purchase.manage')
    const item = tbl(db, 'application_inbox').find((x) => x.id === p.p_inbox_id && x.status === 'waiting')
    if (!item || !tbl(db, 'purchases').some((x) => x.id === p.p_purchase_id)) return fail('NOT_FOUND')
    if (tbl(db, 'applications').some((x) => x.purchase_id === p.p_purchase_id)) fail('ALREADY_HAS_APPLICATION')
    attachApplication(db, p.p_purchase_id as string, item.purchase_type as string, item.payload as Row)
    Object.assign(item, INBOX_CLEAR, { status: 'attached', resolved_purchase_id: p.p_purchase_id, resolved_by: uid(db), resolved_at: now() })
    return null
  },

  // 대기함 줄들로 새 구매 건을 만든다(줄마다 1건)
  rpc_create_from_inbox(db, p) {
    need(db, 'purchase.manage')
    const ids = (p.p_inbox_ids as string[] | null) ?? []
    const items = tbl(db, 'application_inbox').filter((x) => ids.includes(x.id as string) && x.status === 'waiting')
      .sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)))
    for (const item of items) {
      const id = createFromRow(db, item.purchase_type as string, item.source_ref as string, item.payload as Row)
      Object.assign(item, INBOX_CLEAR, { status: 'created', resolved_purchase_id: id, resolved_by: uid(db), resolved_at: now() })
    }
    return items.length
  },

  // 대기함 줄을 버린다. 내용은 지우고 다시 가져오지 않게 기록만 남긴다
  rpc_dismiss_inbox(db, p) {
    need(db, 'purchase.manage')
    const ids = (p.p_inbox_ids as string[] | null) ?? []
    const items = tbl(db, 'application_inbox').filter((x) => ids.includes(x.id as string) && x.status === 'waiting')
    for (const item of items) Object.assign(item, INBOX_CLEAR, { status: 'dismissed', resolved_by: uid(db), resolved_at: now() })
    return items.length
  },

  // 상담사: p_id 가 비어 있으면 새로 등록, 있으면 수정(읽어 간 version 과 다르면 거부)
  rpc_save_counselor(db, p) {
    need(db, 'center.manage')
    const name = typeof p.p_name === 'string' ? p.p_name.trim() : ''
    const memo = blank(p.p_memo)
    const check = () => {
      if (name.length < 1 || [...name].length > 30 || tooLong(memo, 200)) fail('INVALID_INPUT', 'name or memo')
    }
    const rows = tbl(db, 'center_counselors')
    if (p.p_id === null || p.p_id === undefined) {
      if (!tbl(db, 'centers').some((c) => c.id === p.p_center_id && !c.is_headquarters)) fail('NOT_FOUND')
      check()
      const id = uuid()
      rows.push({ id, center_id: p.p_center_id, name, memo, active: p.p_active ?? true, version: 1, created_at: now(), updated_at: now() })
      return id
    }
    const row = rows.find((x) => x.id === p.p_id && x.version === p.p_version)
    if (!row) return rows.some((x) => x.id === p.p_id) ? fail('VERSION_CONFLICT') : fail('NOT_FOUND')
    check()
    Object.assign(row, { name, memo, active: p.p_active ?? row.active })
    touch(row)
    return row.id
  },

  rpc_create_center(db, p) {
    need(db, 'center.manage')
    const v = centerFields(p)
    if (sameName(db, v.name as string, null)) fail('DUPLICATE_NAME')
    const id = uuid()
    tbl(db, 'centers').push({
      id, is_headquarters: false, status: (p.p_status as string | null) ?? 'onboarding', ...v, version: 1,
      created_at: now(), created_by: uid(db), updated_at: now(), updated_by: uid(db),
    })
    return id
  },

  rpc_update_center(db, p) {
    need(db, 'center.manage')
    const row = tbl(db, 'centers').find((c) => c.id === p.p_id)
    if (!row || row.is_headquarters) return fail('NOT_FOUND')
    if (row.version !== p.p_version) fail('VERSION_CONFLICT', String(row.version))
    const v = centerFields(p)
    if (sameName(db, v.name as string, row.id)) fail('DUPLICATE_NAME')
    Object.assign(row, v, { status: p.p_status, updated_by: uid(db) })
    touch(row)
    return row.version
  },
}
