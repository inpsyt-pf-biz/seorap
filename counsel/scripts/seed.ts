// 로컬 시안 시드: 가짜 계정 3개, 인싸이트 본사 행, 가짜 협력센터 7곳, 가짜 구매 건 15건. 실제 정보는 넣지 않는다.
// 센터·구매 건은 화면과 같은 쓰기 함수(counsel.rpc_create_center 등)를 관리자 계정으로 불러 만든다.
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { localEnv, localStatus, SEED_ACCOUNTS, WEB_ENV_FILE } from './local.ts'

const status = await localStatus()
const { password } = await localEnv()

const admin = createClient(status.apiUrl, status.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function ensureUser(email: string): Promise<string> {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.data.user) return created.data.user.id
  const list = await admin.auth.admin.listUsers({ perPage: 1000 })
  const found = list.data.users.find((u) => u.email === email)
  if (!found) throw new Error(`계정 만들기 실패 ${email}: ${created.error?.message}`)
  await admin.auth.admin.updateUserById(found.id, { password })
  return found.id
}

const ids: Record<string, string> = {}
for (const a of SEED_ACCOUNTS) ids[a.key] = await ensureUser(a.email)

// 기관명·연락처·주소·담당자는 모두 지어낸 값이다(전화번호는 국번 0000).
// 지도 위치(pos)는 각 구·시청 근처의 대략적인 좌표다. 새싹은 위치를 비워 "지도 위치 미지정"을 보여 준다.
const ALL = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']
const CENTERS = [
  { name: '마음숲 상담센터', status: 'active', sido: '서울', sigungu: '강남', pos: [37.5172, 127.0473], targets: ['infant', 'child_youth'], specialties: ['development', 'emotion'], regions: ['서울'], modes: ['offline', 'online'], phone: '02-0000-0101', address: '서울특별시 가상구 예시로 101', hours: '평일 10:00~19:00, 토 10:00~15:00', contact: ['김예시', '010-0000-0101'], contract: ['2026-01-01', '2026-12-31'], memo: '주말 상담 가능' },
  { name: '해봄 심리상담연구소', status: 'active', sido: '서울', sigungu: '마포', pos: [37.5663, 126.9019], targets: ['child_youth', 'adult'], specialties: ['youth', 'learning'], regions: ['서울', '경기'], modes: ['offline'], phone: '02-0000-0102', address: '서울특별시 가상구 샘플로 22', hours: '평일 11:00~20:00', contact: ['이샘플', '010-0000-0102'], contract: ['2026-03-01', '2027-02-28'], memo: '' },
  { name: '새벽빛 가족상담센터', status: 'active', sido: '경기', sigungu: '성남', pos: [37.42, 127.1265], targets: ['child_youth', 'adult'], specialties: ['emotion', 'family'], regions: ['경기', '서울'], modes: ['offline', 'online'], phone: '031-0000-0103', address: '경기도 가상시 새벽로 3', hours: '화~토 10:00~18:00', contact: ['박가상', '010-0000-0103'], contract: ['2026-05-01', '2027-04-30'], memo: '' },
  { name: '바다빛 심리연구소', status: 'active', sido: '부산', sigungu: '해운대', pos: [35.1631, 129.1636], targets: ['infant', 'child_youth'], specialties: ['development'], regions: ['부산', '울산', '경남'], modes: ['offline'], phone: '051-0000-0104', address: '부산광역시 가상구 바닷가로 4', hours: '평일 09:30~18:30', contact: ['최임시', '010-0000-0104'], contract: ['2026-02-01', '2027-01-31'], memo: '' },
  { name: '온담 청소년상담센터', status: 'active', sido: '대전', sigungu: '유성', pos: [36.3624, 127.3563], targets: ['child_youth'], specialties: ['youth', 'emotion'], regions: ALL, modes: ['offline', 'online'], phone: '042-0000-0105', address: '대전광역시 가상구 온담길 5', hours: '평일 13:00~21:00, 토 10:00~17:00', contact: ['정테스트', '010-0000-0105'], contract: ['2026-02-01', '2027-01-31'], memo: '비대면 상담은 전 지역 가능' },
  { name: '새싹 아동발달센터', status: 'onboarding', sido: '대구', sigungu: '수성', pos: [null, null], targets: ['infant'], specialties: ['development', 'learning'], regions: ['대구', '경북'], modes: ['offline'], phone: '053-0000-0106', address: '대구광역시 가상구 새싹길 6', hours: '', contact: ['한더미', '010-0000-0106'], contract: [null, null], memo: '계약서 회신 대기' },
  { name: '푸른길 상담센터', status: 'paused', sido: '광주', sigungu: '광산', pos: [35.1396, 126.7937], targets: ['adult'], specialties: ['emotion', 'family'], regions: ['광주', '전남'], modes: ['offline'], phone: '062-0000-0107', address: '광주광역시 가상구 푸른길 7', hours: '평일 10:00~18:00', contact: ['윤예제', '010-0000-0107'], contract: ['2025-07-01', '2026-06-30'], memo: '상담사 충원 전까지 신규 배정 중지' },
] as const

// 가짜 구매 건. 이름은 가나다 순 가명, 전화번호는 국번 0000. center 가 있으면 그 센터에 배정하고 status 까지 진행시킨다.
// 예약 확정·상담 완료 같은 상태 바꾸기 화면은 다음 단계(MVP-2)라서, 시드는 상태만 DB에 직접 넣고 기록(session_events)을 함께 남긴다.
type SeedPurchase = {
  type: 'test_main' | 'counsel_main' | 'sponsored' | 'group_buy'
  order?: string
  app?: Record<string, string | boolean>
  center?: string
  status?: 'requested' | 'confirmed' | 'completed' | 'unable' | 'cancelled'
  at?: string
}
const app = (submitted: string, name: string, guardian: string, test: string, residence: string, extra: Record<string, string | boolean> = {}) => ({
  submitted_at: `${submitted}+09:00`, client_name: name, guardian_name: guardian, test_name: test, residence,
  client_phone: '010-0000-1' + String(name.charCodeAt(0) % 1000).padStart(3, '0'), preferred_method: '대면', preferred_schedule: '평일 오후',
  reason: '(가짜 예시) 상담을 받아 보고 싶어요', consent_third_party: true, refund_policy_checked: true, ...extra,
})
const CBCL = 'K-CBCL 아동·청소년 행동평가척도'
const PURCHASES: SeedPurchase[] = [
  { type: 'test_main', order: 'DEMO-1001', app: app('2026-09-22T10:12:00', '가나다', '가보호', CBCL, '서울 강남구'), center: '마음숲 상담센터', status: 'completed', at: '2026-09-30T16:00:00+09:00' },
  { type: 'test_main', order: 'DEMO-1002', app: app('2026-09-25T14:30:00', '라마바', '라보호', CBCL, '서울 마포구'), center: '해봄 심리상담연구소', status: 'completed', at: '2026-10-06T11:00:00+09:00' },
  { type: 'test_main', order: 'DEMO-1003', app: app('2026-10-01T09:05:00', '사아자', '사보호', 'MMPI-A 청소년 다면적 인성검사', '경기 성남시'), center: '새벽빛 가족상담센터', status: 'confirmed', at: '2026-10-15T17:00:00+09:00' },
  { type: 'test_main', order: 'DEMO-1004', app: app('2026-10-03T20:41:00', '차카타', '차보호', CBCL, '서울 송파구', { preferred_schedule: '토요일 오전' }), center: '마음숲 상담센터', status: 'requested' },
  { type: 'test_main', order: 'DEMO-1005', app: app('2026-10-08T13:20:00', '파하가', '파보호', 'K-WISC-V 아동 지능검사', '서울 강서구', { medication_diagnosis: '(가짜 예시) 진단명 예시' }) },
  { type: 'test_main', order: 'DEMO-1006' },
  { type: 'test_main', order: 'DEMO-1007', app: app('2026-09-28T08:00:00', '나다라', '나보호', CBCL, '인천 연수구'), status: 'cancelled' },
  { type: 'counsel_main', order: 'DEMO-2001', app: app('2026-09-24T19:10:00', '마바사', '', 'SCT 문장완성검사', '부산 해운대구', { counsel_field: '진로', preferred_method: '비대면' }), center: '바다빛 심리연구소', status: 'completed', at: '2026-10-02T19:00:00+09:00' },
  { type: 'counsel_main', order: 'DEMO-2002', app: app('2026-10-04T11:45:00', '아자차', '', 'TCI 기질 및 성격검사', '대전 유성구', { counsel_field: '대인관계' }), center: '온담 청소년상담센터', status: 'confirmed', at: '2026-10-14T15:00:00+09:00' },
  { type: 'counsel_main', order: 'DEMO-2003', app: app('2026-10-09T22:02:00', '카타파', '', 'TCI 기질 및 성격검사', '경기 수원시', { counsel_field: '정서' }) },
  { type: 'sponsored', app: app('2026-09-29T15:00:00', '하가나', '하보호', 'K-WISC-V 아동 지능검사', '서울 노원구'), center: '마음숲 상담센터', status: 'completed', at: '2026-10-08T10:00:00+09:00' },
  { type: 'sponsored', app: app('2026-10-07T09:30:00', '다라마', '다보호', CBCL, '대구 수성구') },
  { type: 'group_buy', app: app('2026-10-02T10:10:00', '바사아', '바보호', '아동 기질검사', '광주 북구'), center: '새벽빛 가족상담센터', status: 'unable' },
  { type: 'group_buy', app: app('2026-10-05T16:40:00', '자차카', '자보호', '아동 기질검사', '대전 서구', { preferred_method: '비대면' }), center: '온담 청소년상담센터', status: 'requested' },
  { type: 'group_buy', app: app('2026-10-10T08:15:00', '타파하', '타보호', '아동 기질검사', '경기 고양시') },
]

async function seedPurchases() {
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ids.admin, role: 'authenticated' })}, true)`
    const centers = await tx<{ id: string; name: string }[]>`select id, name from counsel.centers`
    const centerId = (name: string) => centers.find((c) => c.name === name)!.id
    for (const x of PURCHASES) {
      const [{ id }] = await tx<{ id: string }[]>`
        select counsel.rpc_create_purchase(${x.type}, ${x.order ?? null}, ${null}, ${null}, ${null}, ${null}::date, ${null}, ${null}, ${x.app ? tx.json(x.app) : null}::jsonb) as id`
      const [s] = await tx<{ id: string }[]>`select id from counsel.sessions where purchase_id = ${id}`
      if (x.center) await tx`select counsel.rpc_assign_sessions(array[${s.id}]::uuid[], ${centerId(x.center)}, '')`
      if (x.status && x.status !== 'requested') {
        const from = x.center ? 'requested' : 'unassigned'
        await tx`update counsel.sessions set status = ${x.status}, scheduled_at = ${x.at ?? null}::timestamptz, updated_by = ${ids.admin} where id = ${s.id}`
        await tx`insert into counsel.session_events (session_id, actor, kind, from_status, to_status, note)
          values (${s.id}, ${ids.admin}, 'status_changed', ${from}, ${x.status}, '시드')`
      }
    }
  })
}

const sql = postgres(status.dbUrl, { max: 1, onnotice: () => {} })
try {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from counsel.centers`
  if (n > 0) {
    console.log('센터 데이터가 이미 있다. 처음부터 다시 넣으려면 deno task db:reset')
  } else {
    await sql.begin(async (tx) => {
      for (const a of SEED_ACCOUNTS) {
        await tx`insert into counsel.profiles (user_id, display_name) values (${ids[a.key]}, ${a.name})`
      }
      const [hq] = await tx<{ id: string }[]>`
        insert into counsel.centers (is_headquarters, name, status) values (true, '인싸이트 본사', 'active') returning id`
      for (const a of SEED_ACCOUNTS) {
        if (a.role) await tx`insert into counsel.center_members (center_id, user_id, member_role) values (${hq.id}, ${ids[a.key]}, ${a.role})`
      }
      // 이 트랜잭션 안에서는 관리자 계정으로 요청한 것처럼 쓰기 함수를 부른다
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ids.admin, role: 'authenticated' })}, true)`
      for (const c of CENTERS) {
        await tx`select counsel.rpc_create_center(
          ${c.name}, ${c.status}, ${c.sido}, ${c.sigungu}, ${c.pos[0]}::float8, ${c.pos[1]}::float8, ${[...c.targets]}::text[], ${[...c.specialties]}::text[],
          ${[...c.regions]}::text[], ${[...c.modes]}::text[], ${c.phone}, ${c.address}, ${c.hours}, ${c.contact[0]}, ${c.contact[1]}, ${c.contract[0]}::date, ${c.contract[1]}::date, ${c.memo})`
      }
    })
    console.log(`시드 완료: 계정 ${SEED_ACCOUNTS.length}개, 센터 ${CENTERS.length}곳`)
  }

  const [{ p }] = await sql<{ p: number }[]>`select count(*)::int as p from counsel.purchases`
  if (p > 0) {
    console.log('구매 건 데이터가 이미 있다')
  } else {
    await seedPurchases()
    console.log(`시드 완료: 구매 건 ${PURCHASES.length}건`)
  }
} finally {
  await sql.end()
}

// 화면이 읽을 접속값과 개발용 계정 목록. 커밋하지 않는 파일이다.
// 시드가 정하지 않는 값(예: 네이버 지도 키 VITE_NAVER_MAPS_KEY_ID)은 그대로 둔다.
const devAccounts = SEED_ACCOUNTS.map((a) => ({ label: a.label, email: a.email }))
const managed: Record<string, string> = {
  VITE_SUPABASE_URL: status.apiUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: status.publishableKey,
  VITE_COUNSEL_ENV: 'local',
  VITE_DEV_ACCOUNTS: JSON.stringify(devAccounts),
  VITE_DEV_PASSWORD: password,
}
let kept: string[] = []
try {
  kept = (await Deno.readTextFile(WEB_ENV_FILE)).split(/\r?\n/).filter((l) => {
    const k = /^([A-Z0-9_]+)=/.exec(l)?.[1]
    return k !== undefined && !(k in managed)
  })
} catch { /* 첫 실행 */ }
await Deno.writeTextFile(WEB_ENV_FILE, [...Object.entries(managed).map(([k, v]) => `${k}=${v}`), ...kept, ''].join('\n'))
console.log('web/.env.local 을 썼다')
