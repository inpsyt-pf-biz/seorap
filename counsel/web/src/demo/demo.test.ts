import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CENTER_INPUT, type CenterInput } from '@counsel-core/centers.ts'
import { createFakeClient } from './client'
import { parseSelect, type Tables } from './query'
import { createDemoDb, type DemoDb } from './store'

// 체험판 가짜 DB: 실제 화면 코드(lib/api.ts)를 그대로 붙여 같은 모양으로 읽히는지, 쓰기 함수가 SQL 규칙대로 도는지 본다
const ADMIN = 'u-admin'
const HQ = 'c-hq'
const MAUM = 'c-maum'
const HAEBOM = 'c-haebom'
const PAUSED = 'c-paused'

function fixture(): Tables {
  const center = (id: string, name: string, status: string, hq = false) => ({
    id, name, status, is_headquarters: hq, location_sido: null, location_sigungu: null, latitude: null, longitude: null,
    target_groups: [], specialties: [], regions: [], delivery_modes: [], phone: null, address: null, operating_hours: null,
    contact_name: null, contact_phone: null, contract_from: null, contract_to: null, memo: null, version: 1,
    created_at: '2026-10-01T00:00:00+00:00', updated_at: '2026-10-01T00:00:00+00:00',
  })
  const purchase = (id: string, created: string, type: string | null = 'test_main') => ({
    id, purchase_type: type, product_name: '상품', test_option: null, counsel_option: null, paid_at: created, purchase_memo: null,
    admin_memo: null, source: 'naver', source_ref: null, version: 1, created_at: created,
  })
  const session = (id: string, pid: string, status: string, center: string | null, seq = 1) => ({
    id, purchase_id: pid, seq, status, center_id: center, scheduled_at: null, method: null, assigned_at: center ? '2026-10-02T00:00:00+00:00' : null,
    version: 1,
  })
  return {
    centers: [center(HQ, '인싸이트', 'active', true), center(MAUM, '마음숲', 'active'), center(HAEBOM, '해봄', 'active'), center(PAUSED, '푸른길', 'paused')],
    profiles: [{ user_id: ADMIN, display_name: '김관리' }],
    center_counselors: [],
    purchases: [purchase('p1', '2026-10-01T00:00:00+00:00'), purchase('p2', '2026-10-03T00:00:00+00:00', null), purchase('p3', '2026-10-02T00:00:00+00:00')],
    applications: [{ purchase_id: 'p1', client_name: '가나다', guardian_name: null, test_name: 'K-CBCL', submitted_at: '2026-10-01T01:00:00+00:00' }],
    application_sensitive: [],
    application_marketing: [],
    application_answers: [],
    naver_product_orders: [
      { purchase_id: 'p1', naver_product_order_id: '111', external_order_id: '900', needs_review: false, version: 1 },
      { purchase_id: 'p2', naver_product_order_id: '222', external_order_id: '901', needs_review: true, review_reason: '확인', version: 1 },
    ],
    naver_orderers: [{ purchase_id: 'p2', name_masked: '하*호', tel_masked: '010-****-0001' }],
    naver_settlements: [],
    sessions: [session('s1', 'p1', 'requested', MAUM), session('s2', 'p2', 'unassigned', null), session('s3', 'p3', 'confirmed', MAUM, 2), session('s4', 'p3', 'completed', MAUM, 1)],
    session_events: [{ id: 1, session_id: 's1', at: '2026-10-02T00:00:00+00:00', actor: ADMIN, kind: 'assigned', from_status: 'unassigned', to_status: 'requested' }],
    purchase_notes: [],
    purchase_tests: [
      { id: 't2', purchase_id: 'p1', unit_no: 2, test_name: 'B', exam_status: 'unused', created_at: '2026-10-01T00:00:00+00:00' },
      { id: 't1', purchase_id: 'p1', unit_no: 1, test_name: 'A', exam_status: 'completed', created_at: '2026-10-01T00:00:00+00:00' },
    ],
    application_inbox: [
      {
        id: 'i1', purchase_type: 'test_main', source_ref: 'r1', status: 'waiting', submitted_at: '2026-10-04T00:00:00+00:00', client_name: '거너더',
        guardian_name: null, client_phone: '010-0000-2116', guardian_phone: null, test_name: null, naver_product_order_id: null,
        payload: { application: { client_name: '거너더', client_phone: '010-0000-2116', reason: '상담 희망' }, test_option: '검사', admin_memo: '시트 메모' },
        created_at: '2026-10-04T00:00:00+00:00',
      },
    ],
  }
}

let db: DemoDb
const client = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../shell/supabaseClient', () => ({ get supabase() { return client.current } }))
const api = await import('../lib/api')

beforeEach(() => {
  db = createDemoDb({
    createdAt: 'test',
    context: { user_id: ADMIN, display_name: '김관리', membership: { center_id: HQ, center_name: '인싸이트', is_headquarters: true, role: 'hq_admin' },
      caps: ['center.manage', 'note.write', 'purchase.manage', 'session.assign', 'session.manage', 'settlement.view'] },
    tables: fixture(),
  }, null)
  client.current = createFakeClient(db)
})

describe('읽기: 실제 api.ts 가 같은 모양으로 받는다', () => {
  it('칸 목록을 곁 표까지 읽는다', () => {
    expect(parseSelect('id, applications(client_name, guardian_name), sessions(id, seq)')).toEqual([
      { name: 'id', children: null },
      { name: 'applications', children: [{ name: 'client_name', children: null }, { name: 'guardian_name', children: null }] },
      { name: 'sessions', children: [{ name: 'id', children: null }, { name: 'seq', children: null }] },
    ])
  })

  it('구매 건 목록: 최근 것부터, 1:1 곁 표는 객체(없으면 null), 회차·검사는 배열(순서대로)', async () => {
    const rows = await api.listPurchases()
    expect(rows.map((r) => r.id)).toEqual(['p2', 'p3', 'p1'])
    const p1 = rows.find((r) => r.id === 'p1')!
    expect(p1.applications?.client_name).toBe('가나다')
    expect(p1.naver_orderers).toBeNull()
    expect(p1.purchase_tests).toEqual([{ test_name: 'A', unit_no: 1, exam_status: 'completed' }, { test_name: 'B', unit_no: 2, exam_status: 'unused' }])
    expect(rows.find((r) => r.id === 'p3')!.sessions.map((s) => s.seq)).toEqual([1, 2])
  })

  it('구매 건 상세와 센터 목록(본사 제외, 배정·완료 건수)', async () => {
    const d = await api.getPurchaseDetail('p1')
    expect(d.tests.map((x) => x.test_name)).toEqual(['A', 'B'])
    expect(d.events).toHaveLength(1)
    expect(d.names).toEqual({ [ADMIN]: '김관리' })
    const centers = await api.listCenters()
    expect(centers.map((c) => [c.name, c.assigned_count, c.completed_count])).toEqual([['마음숲', 3, 1], ['푸른길', 0, 0], ['해봄', 0, 0]])
    expect(await api.countInbox()).toBe(1)
    expect(await api.findPurchaseByOrderId('222')).toBe('p2')
    expect(await api.findPurchaseByOrderId('111')).toBeNull()
  })

  it('없는 건은 찾을 수 없다고 알린다', async () => {
    await expect(api.getPurchaseDetail('nope')).rejects.toMatchObject({ code: 'generic' })
    await expect(api.getCenter(HQ)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('쓰기: SQL 함수와 같은 규칙', () => {
  it('배정: 운영 중인 센터만, 같은 센터·완료 회차는 건너뛰고, 처음은 assigned·다시는 reassigned 기록', async () => {
    await expect(api.assignSessions(['s2'], PAUSED, '')).rejects.toMatchObject({ code: 'CENTER_NOT_ASSIGNABLE' })
    expect(await api.assignSessions(['s1', 's2', 's4', 'none'], MAUM, '메모')).toEqual({ assigned: 1, skipped: 3 })
    expect(await api.assignSessions(['s1'], HAEBOM, '')).toEqual({ assigned: 1, skipped: 0 })
    const kinds = db.tables.session_events.filter((e) => e.id !== 1).map((e) => [e.session_id, e.kind, e.to_center, e.note])
    expect(kinds).toEqual([['s2', 'assigned', MAUM, '메모'], ['s1', 'reassigned', HAEBOM, null]])
    expect(db.tables.sessions.find((s) => s.id === 's1')).toMatchObject({ status: 'requested', center_id: HAEBOM, version: 2 })
  })

  it('예약 확정 → 변경 → 상담 완료. 일시·사유가 없거나 상태가 맞지 않으면 거부', async () => {
    await expect(api.updateSession('s1', 1, 'confirm', null, 'offline', '')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const v2 = await api.updateSession('s1', 1, 'confirm', '2026-10-20T05:00:00.000Z', 'offline', '')
    await expect(api.updateSession('s1', 1, 'complete', null, null, '')).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    await expect(api.updateSession('s1', v2, 'reschedule', '2026-10-21T05:00:00.000Z', null, ' ')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const v3 = await api.updateSession('s1', v2, 'reschedule', '2026-10-21T05:00:00.000Z', null, '보호자 사정')
    await expect(api.updateSession('s1', v3, 'confirm', '2026-10-22T05:00:00.000Z', null, '')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
    await api.updateSession('s1', v3, 'complete', null, null, '')
    const s1 = db.tables.sessions.find((s) => s.id === 's1')!
    expect(s1).toMatchObject({ status: 'completed', method: 'offline', scheduled_at: '2026-10-21T05:00:00.000Z' })
    const log = db.tables.session_events.filter((e) => e.id !== 1).map((e) => [e.kind, e.to_status, e.from_scheduled_at, e.to_scheduled_at, e.note])
    expect(log).toEqual([
      ['status_changed', 'confirmed', null, '2026-10-20T05:00:00.000Z', null],
      ['rescheduled', 'confirmed', '2026-10-20T05:00:00.000Z', '2026-10-21T05:00:00.000Z', '보호자 사정'],
      ['status_changed', 'completed', '2026-10-21T05:00:00.000Z', '2026-10-21T05:00:00.000Z', null],
    ])
  })

  it('대기함 붙이기: 신청서가 있는 건은 거부, 붙이면 빈 구매 칸만 채우고 대기함 내용은 지운다', async () => {
    await expect(api.attachInbox('i1', 'p1')).rejects.toMatchObject({ code: 'ALREADY_HAS_APPLICATION' })
    await api.attachInbox('i1', 'p2')
    expect(db.tables.applications.find((a) => a.purchase_id === 'p2')).toMatchObject({ client_name: '거너더', reason: '상담 희망', consent_third_party: false })
    expect(db.tables.purchases.find((p) => p.id === 'p2')).toMatchObject({ purchase_type: 'test_main', test_option: '검사', admin_memo: '시트 메모', version: 2 })
    expect(db.tables.application_inbox[0]).toMatchObject({ status: 'attached', resolved_purchase_id: 'p2', payload: null, client_name: null })
    expect(await api.countInbox()).toBe(0)
  })

  it('대기함으로 새 구매 건: 구매 건·신청서·미배정 상담·imported 기록이 함께 생긴다', async () => {
    expect(await api.createFromInbox(['i1'])).toBe(1)
    const created = db.tables.purchases.find((p) => p.source === 'sheet_import')!
    expect(created).toMatchObject({ purchase_type: 'test_main', source_ref: 'r1' })
    const s = db.tables.sessions.find((x) => x.purchase_id === created.id)!
    expect(s).toMatchObject({ status: 'unassigned', seq: 1 })
    expect(db.tables.session_events.at(-1)).toMatchObject({ session_id: s.id, kind: 'imported', to_status: 'unassigned' })
  })

  it('도중에 실패하면 그 함수가 바꾼 것을 모두 되돌린다', async () => {
    db.tables.application_inbox[0].payload = { application: '문자열' }
    const before = JSON.stringify(db.tables)
    await expect(api.createFromInbox(['i1'])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(JSON.stringify(db.tables)).toBe(before)
  })

  it('메모·구분·확인 필요 내리기', async () => {
    await expect(api.addPurchaseNote('p1', '  ')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await api.addPurchaseNote('p1', '센터 확인함')).toBe(1)
    expect((await api.getPurchaseDetail('p1')).notes).toMatchObject([{ body: '센터 확인함', author: ADMIN }])
    await expect(api.setPurchaseType('p2', 9, 'sponsored')).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(await api.setPurchaseType('p2', 1, 'sponsored')).toBe(2)
    await api.resolveNaverReview('p2')
    await expect(api.resolveNaverReview('p2')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('센터: 이름이 겹치면 거부(대소문자 무시), 고치면 version 이 오른다', async () => {
    const input: CenterInput = { ...EMPTY_CENTER_INPUT, name: '마음숲', regions: ['서울', '서울'] }
    await expect(api.createCenter(input)).rejects.toMatchObject({ code: 'DUPLICATE_NAME' })
    const id = await api.createCenter({ ...input, name: '새 센터' })
    expect(db.tables.centers.find((c) => c.id === id)).toMatchObject({ regions: ['서울'], phone: null, status: 'onboarding' })
    expect(await api.updateCenter(id, 1, { ...input, name: '새 센터 2', status: 'active' })).toBe(2)
    await expect(api.updateCenter(id, 1, { ...input, name: '새 센터 3' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  })
})
