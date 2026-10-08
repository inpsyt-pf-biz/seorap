// 로컬 시안 시드: 가짜 계정 3개, 인싸이트 본사 행, 가짜 협력센터 7곳. 실제 정보는 넣지 않는다.
// 센터는 화면과 같은 쓰기 함수(counsel.rpc_create_center)를 관리자 계정으로 불러 만든다.
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
const ALL = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']
const CENTERS = [
  { name: '마음숲 상담센터', status: 'active', sido: '서울', sigungu: '강남', categories: ['development', 'emotion'], regions: ['서울'], modes: ['offline', 'online'], phone: '02-0000-0101', address: '서울특별시 가상구 예시로 101', contact: ['김예시', '010-0000-0101'], contract: ['2026-01-01', '2026-12-31'], memo: '주말 상담 가능' },
  { name: '해봄 심리상담연구소', status: 'active', sido: '서울', sigungu: '마포', categories: ['youth', 'learning'], regions: ['서울', '경기'], modes: ['offline'], phone: '02-0000-0102', address: '서울특별시 가상구 샘플로 22', contact: ['이샘플', '010-0000-0102'], contract: ['2026-03-01', '2027-02-28'], memo: '' },
  { name: '새벽빛 가족상담센터', status: 'active', sido: '경기', sigungu: '성남', categories: ['emotion', 'family'], regions: ['경기', '서울'], modes: ['offline', 'online'], phone: '031-0000-0103', address: '경기도 가상시 새벽로 3', contact: ['박가상', '010-0000-0103'], contract: ['2026-05-01', '2027-04-30'], memo: '' },
  { name: '바다빛 심리연구소', status: 'active', sido: '부산', sigungu: '해운대', categories: ['development'], regions: ['부산', '울산', '경남'], modes: ['offline'], phone: '051-0000-0104', address: '부산광역시 가상구 바닷가로 4', contact: ['최임시', '010-0000-0104'], contract: ['2026-02-01', '2027-01-31'], memo: '' },
  { name: '온담 청소년상담센터', status: 'active', sido: '대전', sigungu: '유성', categories: ['youth', 'emotion'], regions: ALL, modes: ['offline', 'online'], phone: '042-0000-0105', address: '대전광역시 가상구 온담길 5', contact: ['정테스트', '010-0000-0105'], contract: ['2026-02-01', '2027-01-31'], memo: '비대면 상담은 전 지역 가능' },
  { name: '새싹 아동발달센터', status: 'onboarding', sido: '대구', sigungu: '수성', categories: ['development', 'learning'], regions: ['대구', '경북'], modes: ['offline'], phone: '053-0000-0106', address: '대구광역시 가상구 새싹길 6', contact: ['한더미', '010-0000-0106'], contract: [null, null], memo: '계약서 회신 대기' },
  { name: '푸른길 상담센터', status: 'paused', sido: '광주', sigungu: '광산', categories: ['emotion', 'family'], regions: ['광주', '전남'], modes: ['offline'], phone: '062-0000-0107', address: '광주광역시 가상구 푸른길 7', contact: ['윤예제', '010-0000-0107'], contract: ['2025-07-01', '2026-06-30'], memo: '상담사 충원 전까지 신규 배정 중지' },
] as const

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
          ${c.name}, ${c.status}, ${c.sido}, ${c.sigungu}, ${[...c.categories]}::text[], ${[...c.regions]}::text[], ${[...c.modes]}::text[],
          ${c.phone}, ${c.address}, ${c.contact[0]}, ${c.contact[1]}, ${c.contract[0]}::date, ${c.contract[1]}::date, ${c.memo})`
      }
    })
    console.log(`시드 완료: 계정 ${SEED_ACCOUNTS.length}개, 센터 ${CENTERS.length}곳`)
  }
} finally {
  await sql.end()
}

// 화면이 읽을 접속값과 개발용 계정 목록. 커밋하지 않는 파일이다.
const devAccounts = SEED_ACCOUNTS.map((a) => ({ label: a.label, email: a.email }))
await Deno.writeTextFile(WEB_ENV_FILE, [
  `VITE_SUPABASE_URL=${status.apiUrl}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${status.publishableKey}`,
  'VITE_COUNSEL_ENV=local',
  `VITE_DEV_ACCOUNTS=${JSON.stringify(devAccounts)}`,
  `VITE_DEV_PASSWORD=${password}`,
  '',
].join('\n'))
console.log('web/.env.local 을 썼다')
