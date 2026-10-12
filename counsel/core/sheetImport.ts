// 구글폼 응답 시트(CSV)를 신청서 칸으로 옮긴다. 신청서 4종(검사 메인·상담 메인·협찬·공동구매)은 질문 문장과 순서가 다르므로,
// 열 이름(질문 문장)에 들어 있는 낱말로 칸을 찾는다. 같은 칸에 맞는 열이 둘 이상이면 앞의 열을 쓴다.
import { parseCsv } from './csv.ts'
import { APPLICATION_LIMITS, EMPTY_APPLICATION, overLimitFields, type ApplicationInput } from './purchases.ts'

export type SheetField =
  | keyof Omit<ApplicationInput, 'consent_third_party' | 'refund_policy_checked'>
  | 'consent' | 'consent_confirm' | 'refund' | 'ended' | 'reserved' | 'schedule_note'
  | 'test_option' | 'counsel_option' | 'purchase_memo' | 'admin_memo'

const norm = (h: string) => h.replace(/\(필수\)/g, '').replace(/[\s.,?!'"‘’“”·]/g, '')
const has = (h: string, ...words: string[]) => words.every((w) => h.includes(w))

// 위에서부터 차례로 본다. 앞의 규칙이 이긴다.
const RULES: { field: SheetField; test: (h: string) => boolean }[] = [
  { field: 'submitted_at', test: (h) => has(h, '타임스탬프') },
  { field: 'ended', test: (h) => has(h, '상담종료') },
  { field: 'reserved', test: (h) => has(h, '예약전화완료') || h === '예약완료' },
  { field: 'schedule_note', test: (h) => has(h, '상담예약일정') },
  { field: 'consent', test: (h) => has(h, '제3자제공동의') },
  { field: 'consent_confirm', test: (h) => has(h, '확인하고동의') },
  { field: 'refund', test: (h) => has(h, '환불') },
  { field: 'guardian_phone', test: (h) => has(h, '보호자', '연락처') },
  { field: 'guardian_name', test: (h) => has(h, '보호자') && (has(h, '성함') || has(h, '이름')) },
  { field: 'client_phone', test: (h) => has(h, '연락처') },
  { field: 'client_name', test: (h) => has(h, '성함') || has(h, '아이의이름') },
  { field: 'client_birth', test: (h) => has(h, '생년월일') },
  { field: 'result_file_url', test: (h) => has(h, '결과지') },
  { field: 'test_name', test: (h) => has(h, '심리검사를선택') },
  { field: 'residence', test: (h) => has(h, '거주') },
  { field: 'school', test: (h) => has(h, '학교') },
  { field: 'counsel_field', test: (h) => has(h, '분야') },
  { field: 'reason', test: (h) => has(h, '이유') },
  { field: 'preferred_schedule', test: (h) => has(h, '희망예약일') || has(h, '요일과시간대') },
  { field: 'medication_diagnosis', test: (h) => has(h, '약물') || has(h, '질환') },
  { field: 'counseling_experience', test: (h) => has(h, '상담경험') },
  { field: 'referral_source', test: (h) => has(h, '알게된경위') },
  { field: 'expectation', test: (h) => has(h, '기대') },
  { field: 'preferred_method', test: (h) => has(h, '상담방식') },
  { field: 'request_note', test: (h) => has(h, '요청사항') },
  { field: 'test_option', test: (h) => has(h, '검사옵션') },
  { field: 'counsel_option', test: (h) => has(h, '상담옵션') },
  { field: 'purchase_memo', test: (h) => has(h, '구매시메모') },
  { field: 'admin_memo', test: (h) => has(h, '관리자메모') },
]

export type HeaderMapping = { columns: Partial<Record<SheetField, number>>; ignored: string[] }

export function mapHeaders(headers: string[]): HeaderMapping {
  const columns: Partial<Record<SheetField, number>> = {}
  const ignored: string[] = []
  headers.forEach((raw, i) => {
    const h = norm(raw)
    const rule = h ? RULES.find((r) => r.test(h)) : undefined
    if (!rule) { if (raw.trim()) ignored.push(raw.trim()); return }
    if (columns[rule.field] === undefined) columns[rule.field] = i
    else ignored.push(raw.trim())
  })
  return { columns, ignored }
}

const truthy = (v: string) => /^(true|o|y|yes|예|완료|v|✓|✔)$/i.test(v.trim())

// "동의" 가 들어 있고 거부의 뜻이 없으면 동의로 본다(폼 선택지: "확인하고 동의", "동의합니다" 등)
function agreed(v: string): boolean {
  const s = v.trim()
  if (!s || /^false$/i.test(s)) return false
  if (/미동의|동의하지|비동의|거부/.test(s)) return false
  return s.includes('동의') || truthy(s)
}

// 구글시트 타임스탬프("2026. 9. 3 오후 2:15:30", "2026/09/03 14:15:30", "2026-09-03 14:15:30")를 서울 시각으로 읽는다
export function parseSheetTimestamp(v: string): string | null {
  const m = /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\.?\s*(오전|오후)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(v.trim())
  if (!m) return null
  let hour = Number(m[5])
  if (m[4] === '오후' && hour < 12) hour += 12
  if (m[4] === '오전' && hour === 12) hour = 0
  const p2 = (n: number | string) => String(n).padStart(2, '0')
  return `${m[1]}-${p2(m[2])}-${p2(m[3])}T${p2(hour)}:${m[6]}:${p2(m[7] ?? 0)}+09:00`
}

export type ImportRow = {
  source_key: string
  application: ApplicationInput
  test_option: string
  counsel_option: string
  purchase_memo: string
  admin_memo: string
}

export type PreviewRow = { line: number; row: ImportRow; state: 'ok' | 'ended' | 'tooLong' | 'empty'; fields?: string[] }

export type ImportPreview = {
  headerCount: number
  mapping: HeaderMapping
  rows: PreviewRow[]
  counts: { ok: number; ended: number; tooLong: number; empty: number }
}

export function toImportRow(cells: string[], m: HeaderMapping): ImportRow & { ended: boolean; reserved: boolean } {
  const get = (f: SheetField) => {
    const i = m.columns[f]
    return i === undefined ? '' : (cells[i] ?? '').trim()
  }
  const a: ApplicationInput = { ...EMPTY_APPLICATION }
  for (const k of Object.keys(APPLICATION_LIMITS) as (keyof ApplicationInput)[]) {
    if (k in m.columns || (k as SheetField) in m.columns) (a as Record<string, unknown>)[k] = get(k as SheetField)
  }
  const stamp = get('submitted_at')
  a.submitted_at = parseSheetTimestamp(stamp)
  a.consent_third_party = agreed(get('consent')) || agreed(get('consent_confirm'))
  a.refund_policy_checked = get('refund') !== '' && !/^false$/i.test(get('refund'))
  // 시트에서 담당자가 적던 칸은 잃지 않도록 관리자 메모에 붙인다
  const reserved = truthy(get('reserved'))
  const notes = [
    get('admin_memo'),
    get('schedule_note') && `[시트] 상담 예약 일정: ${get('schedule_note')}`,
    reserved && '[시트] 예약 완료 체크됨',
  ].filter(Boolean)
  return {
    source_key: [stamp, a.client_phone, a.client_name || a.guardian_name].join('|'),
    application: a,
    test_option: get('test_option'),
    counsel_option: get('counsel_option'),
    purchase_memo: get('purchase_memo'),
    admin_memo: notes.join('\n'),
    ended: truthy(get('ended')),
    reserved,
  }
}

// CSV 전체를 읽어 미리보기를 만든다. 상담 종료 체크된 줄은 기본으로 건너뛴다.
export function previewImport(csvText: string, opts: { skipEnded: boolean } = { skipEnded: true }): ImportPreview {
  const [headers = [], ...body] = parseCsv(csvText)
  const mapping = mapHeaders(headers)
  const rows: PreviewRow[] = body.map((cells, i) => {
    const { ended, reserved: _reserved, ...row } = toImportRow(cells, mapping)
    const line = i + 2 // 시트의 줄 번호(1줄은 머리글)
    if (!row.application.client_name && !row.application.guardian_name && !row.application.client_phone) return { line, row, state: 'empty' }
    if (opts.skipEnded && ended) return { line, row, state: 'ended' }
    const over = overLimitFields(row.application)
    if (over.length > 0 || row.admin_memo.length > 2000) return { line, row, state: 'tooLong', fields: over }
    return { line, row, state: 'ok' }
  })
  const counts = { ok: 0, ended: 0, tooLong: 0, empty: 0 }
  for (const r of rows) counts[r.state] += 1
  return { headerCount: headers.length, mapping, rows, counts }
}

// DB 함수 rpc_import_applications 에 넘길 모양
export function importPayload(p: ImportPreview): Record<string, unknown>[] {
  return p.rows.filter((r) => r.state === 'ok').map(({ row }) => ({
    source_key: row.source_key,
    test_option: row.test_option,
    counsel_option: row.counsel_option,
    purchase_memo: row.purchase_memo,
    admin_memo: row.admin_memo,
    application: row.application,
  }))
}
