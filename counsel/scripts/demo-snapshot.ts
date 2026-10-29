// 체험판에 넣을 가짜 데이터를 로컬 DB에서 꺼내 web/.demo/snapshot.json 에 쓴다.
// 관리자 계정으로 화면과 같은 길(PostgREST)로 읽으므로, 화면에 보이지 않는 값(주문자 암호문 등)은 담기지 않는다.
// 받는 사람에게 넘어가는 파일이므로 시드가 만든 가짜 데이터만 담는다:
//  1) 빈 DB에 시드를 넣은 시각(web/.demo/seeded-at.json, seed.ts 가 남김) 뒤에 생기거나 바뀐 줄이 하나라도 있으면 멈춘다
//  2) 전화번호 칸은 숫자만 남겨 시드 번호(가운데 0000)인지 한 번 더 본다
//  3) 시트 가져오기 중복 판정 키(source_ref, 신청자 정보의 해시)는 담지 않고 줄 번호로 바꾼다
// 실행: deno run -A scripts/demo-snapshot.ts (보통은 deno task demo 가 부른다)
import { createClient } from '@supabase/supabase-js'
import { localEnv, localStatus, SEED_ACCOUNTS } from './local.ts'

const RESET_HINT = 'deno task db:reset 으로 시드를 새로 깐 뒤, 화면에서 아무것도 바꾸지 않은 상태로 다시 해 주세요'

let seededAt: number
try {
  const marker = JSON.parse(await Deno.readTextFile(new URL('../web/.demo/seeded-at.json', import.meta.url))) as { seededAt?: string }
  seededAt = Date.parse(marker.seededAt ?? '')
  if (Number.isNaN(seededAt)) throw new Error('bad marker')
} catch {
  throw new Error(`시드를 넣은 기록이 없어요. ${RESET_HINT}`)
}

const status = await localStatus()
const env = await localEnv()
const client = createClient(status.apiUrl, status.publishableKey, {
  db: { schema: 'counsel' },
  auth: { persistSession: false, autoRefreshToken: false },
})
const admin = SEED_ACCOUNTS.find((a) => a.key === 'admin')!
const signIn = await client.auth.signInWithPassword({ email: admin.email, password: env.password })
if (signIn.error) throw new Error(`관리자 로그인 실패: ${signIn.error.message}`)

// 화면이 읽는 표. 주문자는 화면에 열린 칸(가린 이름·연락처)만 읽는다
const TABLES: [string, string][] = [
  ['centers', '*'], ['profiles', '*'], ['center_counselors', '*'],
  ['purchases', '*'], ['applications', '*'], ['application_sensitive', '*'], ['application_marketing', '*'],
  ['naver_product_orders', '*'], ['naver_orderers', 'purchase_id, name_masked, tel_masked, created_at, updated_at'], ['naver_settlements', '*'],
  ['sessions', '*'], ['session_events', '*'], ['purchase_notes', '*'], ['purchase_tests', '*'], ['application_inbox', '*'],
  // 신청서 템플릿(서랍 B2). 체험판은 읽기만 한다(편집·게시 함수는 rpc.ts 에 없다)
  ['form_templates', '*'], ['form_template_versions', '*'], ['form_product_links', '*'], ['application_answers', '*'],
]

const tables: Record<string, Record<string, unknown>[]> = {}
for (const [name, columns] of TABLES) {
  const { data, error } = await client.from(name).select(columns)
  if (error) throw new Error(`${name} 읽기 실패: ${error.message}`)
  tables[name] = data as unknown as Record<string, unknown>[]
}
const { data: context, error } = await client.rpc('my_context')
if (error) throw new Error(`my_context 실패: ${error.message}`)

// 1) 시드 뒤에 생기거나 바뀐 줄(쓴 시각 칸만 본다. 예약 일시처럼 앞날을 적는 칸은 보지 않는다)
const WRITTEN = ['created_at', 'updated_at', 'at', 'resolved_at', 'synced_at']
const changed = Object.entries(tables)
  .filter(([, rows]) => rows.some((r) => WRITTEN.some((k) => typeof r[k] === 'string' && Date.parse(r[k] as string) > seededAt + 2000)))
  .map(([name]) => name)
if (changed.length > 0) throw new Error(`시드 뒤에 바뀐 데이터가 있어요(${changed.join(', ')}). ${RESET_HINT}`)

// 2) 전화번호: 칸 이름에 phone·tel 이 들어간 값은 숫자만 남겨 0 + 국번(1~2자리) + 0000 + 4자리여야 한다. 가린 번호(*)는 넘어간다
const strange: string[] = []
const walk = (v: unknown, where: string, key: string) => {
  if (typeof v === 'string') {
    const digits = v.replace(/\D/g, '')
    if (/phone|tel/.test(key) && !v.includes('*') && digits.length >= 8 && !/^0\d{1,2}0000\d{4}$/.test(digits)) strange.push(where)
    for (const m of v.matchAll(/\b0\d{1,2}-(\d{3,4})-\d{4}\b/g)) if (m[1] !== '0000') strange.push(where)
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${where}[${i}]`, key))
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`, k)
  }
}
walk(tables, 'tables', '')
if (strange.length > 0) throw new Error(`시드 번호가 아닌 전화번호가 있어요(${strange.length}곳, 예: ${strange[0]}). ${RESET_HINT}`)

// 3) 중복 판정 키는 줄 번호로 바꾼다
for (const name of ['purchases', 'application_inbox']) {
  for (const r of tables[name]) if (r.source_ref !== null && r.source_ref !== undefined) r.source_ref = `snapshot:${r.id}`
}

const out = new URL('../web/.demo/snapshot.json', import.meta.url)
await Deno.writeTextFile(out, JSON.stringify({ createdAt: new Date().toISOString(), context, tables }))
console.log(`체험판 데이터: ${Object.entries(tables).map(([k, v]) => `${k} ${v.length}`).join(', ')}`)
