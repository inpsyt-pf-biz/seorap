// 로컬 시안 시드: 가짜 계정 3개, 인싸이트 본사 행, 가짜 협력센터 7곳(상담사 포함), 가짜 구매 건 16건(네이버 14건, 직접 등록 3건 중 1건은 네이버 건과 합쳐짐), 신청서 대기함 2건, 검사 실시 현황 10줄. 실제 정보는 넣지 않는다.
// 센터·직접 등록 건은 화면과 같은 쓰기 함수를 관리자 계정으로, 네이버 건은 연동과 같은 입구 함수를 service_role 로 불러 만든다.
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { toIntakeParts, type NaverIntakeRow, type NaverProductOrderDetail } from '../core/naverIntake.ts'
import { localEnv, localStatus, SEED_ACCOUNTS, WEB_ENV_FILE } from './local.ts'
import { piiTools } from './pii.ts'

const status = await localStatus()
const env = await localEnv()
const { password } = env

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

// 가짜 구매 건. 이름은 가나다 순 가명, 전화번호는 국번 0000, 상품주문번호·상품번호는 지어낸 번호다.
// 네이버 건은 실제 연동과 같은 길로 넣는다: 커머스API 응답 모양 → core/naverIntake.ts → 주문자 암호화(scripts/pii.ts) → 입구 함수(service_role).
// 예약 확정·상담 완료 같은 상태 바꾸기 화면은 다음 단계라서, 시드는 상태만 DB에 직접 넣고 기록(session_events)을 함께 남긴다.
type SessionGoal = 'requested' | 'confirmed' | 'completed' | 'unable' | 'cancelled'
type SeedPurchase = {
  // 네이버 건: 상품번호(아래 PRODUCTS), 수량, 주문자(null 이면 선물하기)
  naver?: { product: string; qty?: number; orderer: [string, string] | null; po?: Partial<NaverProductOrderDetail['productOrder']> }
  // 직접 등록 건(협찬 등). withOrderId 면 상품주문번호를 적어 두고, 같은 번호가 네이버에서 들어와 채워지는 모습을 보인다
  manual?: { type: 'test_main' | 'counsel_main' | 'sponsored' | 'group_buy'; withOrderId?: boolean }
  app?: Record<string, string | boolean>
  center?: string
  status?: SessionGoal
  at?: string
  // 두 번째 수집 때 바뀌는 네이버 값(취소 요청·취소 완료·일부 취소)
  later?: { po: Partial<NaverProductOrderDetail['productOrder']>; claim?: NaverProductOrderDetail['currentClaim'] }
}

// 네이버 상품 → 구매 구분 목록표(지어낸 상품번호). 9000000099 는 일부러 빼서 '미분류'를 보인다.
const PRODUCTS: Record<string, { name: string; price: number; type?: 'test_main' | 'counsel_main' | 'group_buy' }> = {
  '9000000001': { name: 'K-CBCL 검사 + 해석상담', price: 90000, type: 'test_main' },
  '9000000002': { name: 'MMPI-A 검사 + 해석상담', price: 110000, type: 'test_main' },
  '9000000003': { name: 'TCI 해석상담', price: 70000, type: 'counsel_main' },
  '9000000004': { name: '아동 기질검사 공동구매', price: 50000, type: 'group_buy' },
  '9000000099': { name: '진로 상담 체험권', price: 30000 },
}

const app = (submitted: string, name: string, guardian: string, test: string, residence: string, extra: Record<string, string | boolean> = {}) => ({
  submitted_at: `${submitted}+09:00`, client_name: name, guardian_name: guardian, test_name: test, residence,
  client_phone: '010-0000-1' + String(name.charCodeAt(0) % 1000).padStart(3, '0'), preferred_method: '대면', preferred_schedule: '평일 오후',
  reason: '(가짜 예시) 상담을 받아 보고 싶어요', consent_third_party: true, refund_policy_checked: true, ...extra,
})
const CBCL = 'K-CBCL 아동·청소년 행동평가척도'
const decided = (at: string) => ({ productOrderStatus: 'PURCHASE_DECIDED', decisionDate: at })
const cancelDone = (requested: string, completed: string) => ({
  po: { productOrderStatus: 'CANCELED', claimType: 'CANCEL', claimStatus: 'CANCEL_DONE', remainQuantity: 0, remainPaymentAmount: 0 },
  claim: { cancel: { claimRequestDate: requested, cancelCompletedDate: completed } },
})
const PURCHASES: SeedPurchase[] = [
  { naver: { product: '9000000001', orderer: ['가보호', '010-0000-2101'], po: decided('2026-10-05T09:00:00.000+09:00') }, app: app('2026-09-22T10:12:00', '가나다', '가보호', CBCL, '서울 강남구'), center: '마음숲 상담센터', status: 'completed', at: '2026-09-30T16:00:00+09:00' },
  { manual: { type: 'test_main', withOrderId: true }, naver: { product: '9000000001', orderer: ['라보호', '010-0000-2102'] }, app: app('2026-09-25T14:30:00', '라마바', '라보호', CBCL, '서울 마포구'), center: '해봄 심리상담연구소', status: 'completed', at: '2026-10-06T11:00:00+09:00' },
  { naver: { product: '9000000002', orderer: ['사보호', '010-0000-2103'] }, app: app('2026-10-01T09:05:00', '사아자', '사보호', 'MMPI-A 청소년 다면적 인성검사', '경기 성남시'), center: '새벽빛 가족상담센터', status: 'confirmed', at: '2026-10-15T17:00:00+09:00',
    later: cancelDone('2026-10-11T10:00:00.000+09:00', '2026-10-11T15:00:00.000+09:00') },
  { naver: { product: '9000000001', orderer: ['차보호', '010-0000-2104'] }, app: app('2026-10-03T20:41:00', '차카타', '차보호', CBCL, '서울 송파구', { preferred_schedule: '토요일 오전' }), center: '마음숲 상담센터', status: 'requested',
    later: { po: { claimType: 'CANCEL', claimStatus: 'CANCEL_REQUEST' }, claim: { cancel: { claimRequestDate: '2026-10-12T09:30:00.000+09:00' } } } },
  { naver: { product: '9000000001', orderer: ['파보호', '010-0000-2105'] }, app: app('2026-10-08T13:20:00', '파하가', '파보호', 'K-WISC-V 아동 지능검사', '서울 강서구', { medication_diagnosis: '(가짜 예시) 진단명 예시' }) },
  { naver: { product: '9000000001', orderer: ['하보호', '010-0000-2106'] } },
  { naver: { product: '9000000001', orderer: ['나보호', '010-0000-2107'] }, app: app('2026-09-28T08:00:00', '나다라', '나보호', CBCL, '인천 연수구'),
    later: cancelDone('2026-09-29T10:00:00.000+09:00', '2026-09-29T11:00:00.000+09:00') },
  { naver: { product: '9000000003', orderer: ['마바사', '010-0000-2108'], po: decided('2026-10-04T09:00:00.000+09:00') }, app: app('2026-09-24T19:10:00', '마바사', '', 'SCT 문장완성검사', '부산 해운대구', { counsel_field: '진로', preferred_method: '비대면' }), center: '바다빛 심리연구소', status: 'completed', at: '2026-10-02T19:00:00+09:00' },
  { naver: { product: '9000000003', orderer: ['아자차', '010-0000-2109'] }, app: app('2026-10-04T11:45:00', '아자차', '', 'TCI 기질 및 성격검사', '대전 유성구', { counsel_field: '대인관계' }), center: '온담 청소년상담센터', status: 'confirmed', at: '2026-10-14T15:00:00+09:00' },
  { naver: { product: '9000000099', orderer: ['카타파', '010-0000-2110'] }, app: app('2026-10-09T22:02:00', '카타파', '', 'TCI 기질 및 성격검사', '경기 수원시', { counsel_field: '정서' }) },
  { manual: { type: 'sponsored' }, app: app('2026-09-29T15:00:00', '하가나', '하보호', 'K-WISC-V 아동 지능검사', '서울 노원구'), center: '마음숲 상담센터', status: 'completed', at: '2026-10-08T10:00:00+09:00' },
  { manual: { type: 'sponsored' }, app: app('2026-10-07T09:30:00', '다라마', '다보호', CBCL, '대구 수성구') },
  { naver: { product: '9000000004', orderer: ['바보호', '010-0000-2113'] }, app: app('2026-10-02T10:10:00', '바사아', '바보호', '아동 기질검사', '광주 북구'), center: '새벽빛 가족상담센터', status: 'unable' },
  { naver: { product: '9000000004', orderer: null, po: { giftReceivingStatus: 'RECEIVED' } }, app: app('2026-10-05T16:40:00', '자차카', '자보호', '아동 기질검사', '대전 서구', { preferred_method: '비대면' }), center: '온담 청소년상담센터', status: 'requested' },
  { naver: { product: '9000000004', qty: 2, orderer: ['타보호', '010-0000-2115'] }, app: app('2026-10-10T08:15:00', '타파하', '타보호', '아동 기질검사', '경기 고양시'),
    later: { po: { claimType: 'CANCEL', claimStatus: 'CANCEL_DONE', remainQuantity: 1, remainPaymentAmount: 50000 }, claim: { cancel: { claimRequestDate: '2026-10-11T08:00:00.000+09:00', cancelCompletedDate: '2026-10-11T09:00:00.000+09:00' } } } },
  // 신청서가 아직 없는 네이버 주문. 아래 대기함 신청서(거보호)의 후보로 보인다
  { naver: { product: '9000000001', orderer: ['거보호', '010-0000-2116'] } },
]

// 신청서 대기함에 넣을 구글시트 줄(상품주문번호 없음). 거너더는 위 주문의 후보로, 노도로는 후보 없이(새 구매 건으로 등록할 협찬 건) 보인다
const INBOX_ROWS = [
  { type: 'test_main', app: app('2026-10-10T19:30:00', '거너더', '거보호', CBCL, '서울 은평구', { guardian_phone: '010-0000-2116' }) },
  { type: 'sponsored', app: app('2026-10-11T10:05:00', '노도로', '노보호', 'K-WISC-V 아동 지능검사', '경기 부천시') },
] as const

// 상담 진행 시드: 예약 확정(일시), 상담 완료, 상담 불가(사유). 화면과 같은 함수(rpc_update_session)를 관리자로 부른다
const NOTES: Record<number, string[]> = {
  2: ['센터에서 10/15 오후 5시로 확정 연락 받음', '(가짜 예시) 보호자가 결과지 출력본을 원함'],
  12: ['센터 상담사 일정이 꽉 차 상담 불가로 바꿈. 다른 센터 알아보는 중'],
}
const COUNSELORS: Record<string, [string, string][]> = {
  '마음숲 상담센터': [['김상담', '아동 정서'], ['이상담', '놀이치료']],
  '해봄 심리상담연구소': [['박상담', '청소년 진로']],
  '새벽빛 가족상담센터': [['최상담', '가족 상담'], ['정상담', '']],
  '바다빛 심리연구소': [['한상담', '발달 평가']],
  '온담 청소년상담센터': [['윤상담', '청소년 정서'], ['장상담', '비대면 가능']],
}

const productOrderIdOf = (i: number) => `20261001${String(i + 1).padStart(8, '0')}`

// 커머스API '상품 주문 상세 내역 조회' data[n] 모양으로 지어낸다
function naverDetail(x: SeedPurchase, i: number, round: 1 | 2): NaverProductOrderDetail {
  const n = x.naver!
  const p = PRODUCTS[n.product]
  const qty = n.qty ?? 1
  const amount = p.price * qty
  const paidAt = `${x.app ? String(x.app.submitted_at).slice(0, 10) : '2026-10-09'}T09:00:00.000+09:00`
  const detail: NaverProductOrderDetail = {
    order: {
      orderId: `30261001${String(i + 1).padStart(8, '0')}`, orderDate: paidAt, paymentDate: paidAt,
      ...(n.orderer ? { ordererName: n.orderer[0], ordererTel: n.orderer[1], ordererNo: `99${String(i + 1).padStart(5, '0')}` } : {}),
    },
    productOrder: {
      productOrderId: productOrderIdOf(i), productOrderStatus: 'PAYED', placeOrderStatus: 'OK', productId: n.product, originalProductId: `8${n.product.slice(1)}`,
      itemNo: n.product, sellerProductCode: `SEED-${n.product.slice(-2)}`, productName: p.name, productOption: '상담 방식: 대면',
      quantity: qty, initialQuantity: qty, remainQuantity: qty, totalPaymentAmount: amount, initialPaymentAmount: amount, remainPaymentAmount: amount,
      inflowPath: '네이버 쇼핑', expectedSettlementAmount: Math.round(amount * 0.95), paymentCommission: Math.round(amount * 0.03), channelCommission: Math.round(amount * 0.02),
      ...n.po,
      ...(round === 2 ? x.later?.po : {}),
    },
  }
  if (round === 2 && x.later?.claim) detail.currentClaim = x.later.claim
  return detail
}

async function intake(details: NaverProductOrderDetail[]) {
  const pii = piiTools({ encKey: env.piiEncKey, hmacKey: env.piiHmacKey })
  const receivedAt = new Date().toISOString()
  const rows: NaverIntakeRow[] = []
  for (const d of details) {
    const { ordererPlain, ...parts } = toIntakeParts(d, receivedAt)
    rows.push({ ...parts, orderer: await pii.protect(ordererPlain) })
  }
  const { error } = await admin.schema('counsel').rpc('rpc_intake_naver_product_orders', { p_rows: rows })
  if (error) throw new Error(`네이버 입구 실패: ${error.message} ${error.details ?? ''}`)
}

async function seedPurchases() {
  await sql.begin(async (tx) => {
    for (const [id, p] of Object.entries(PRODUCTS)) {
      if (p.type) await tx`insert into counsel.naver_product_types (naver_product_id, purchase_type, label) values (${id}, ${p.type}, ${p.name})`
    }
    // 직접 등록 건은 관리자 계정으로 등록 함수를 부른다
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ids.admin, role: 'authenticated' })}, true)`
    for (const [i, x] of PURCHASES.entries()) {
      if (!x.manual) continue
      const product = x.naver ? PRODUCTS[x.naver.product].name : null
      await tx`select counsel.rpc_create_purchase(${x.manual.type}, ${x.manual.withOrderId ? productOrderIdOf(i) : null}, ${product}, ${null}, ${null}, ${null}::timestamptz, ${null}, ${null}, ${x.app ? tx.json(x.app) : null}::jsonb)`
    }
  })

  // 네이버 1차 수집: 결제된 주문이 들어온다(직접 등록해 둔 상품주문번호는 새로 만들지 않고 채운다)
  await intake(PURCHASES.flatMap((x, i) => (x.naver ? [naverDetail(x, i, 1)] : [])))

  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ids.admin, role: 'authenticated' })}, true)`
    const centers = await tx<{ id: string; name: string }[]>`select id, name from counsel.centers`
    const centerId = (name: string) => centers.find((c) => c.name === name)!.id
    for (const [i, x] of PURCHASES.entries()) {
      const [{ id }] = x.naver
        ? await tx<{ id: string }[]>`select purchase_id as id from counsel.naver_product_orders where naver_product_order_id = ${productOrderIdOf(i)}`
        : await tx<{ id: string }[]>`select p.id from counsel.purchases p join counsel.applications a on a.purchase_id = p.id where a.client_name = ${String(x.app!.client_name)}`
      // 네이버 건의 신청서는 신청서 붙이기 기능이 생기기 전까지 시드가 직접 붙인다
      if (x.naver && !x.manual && x.app) await tx`select counsel_private._insert_application(${id}, ${tx.json(x.app)}::jsonb)`
      const [s] = await tx<{ id: string }[]>`select id from counsel.sessions where purchase_id = ${id} order by seq limit 1`
      if (x.center) {
        await tx`select counsel.rpc_assign_sessions(array[${s.id}]::uuid[], ${centerId(x.center)}, '')`
        // 가짜 데이터의 날짜가 앞뒤로 맞도록 배정 일시를 신청 다음 날로 둔다(배정 함수는 지금 시각을 적는다)
        if (x.app) await tx`update counsel.sessions set assigned_at = ${String(x.app.submitted_at)}::timestamptz + interval '1 day' where id = ${s.id}`
      }
      const step = async (action: string, at: string | null, reason: string) => {
        const [{ version }] = await tx<{ version: number }[]>`select version from counsel.sessions where id = ${s.id}`
        await tx`select counsel.rpc_update_session(${s.id}, ${version}, ${action}, ${at}::timestamptz, ${at ? 'offline' : null}, ${reason})`
      }
      if (x.status === 'confirmed' || x.status === 'completed') await step('confirm', x.at!, '')
      if (x.status === 'completed') await step('complete', null, '')
      if (x.status === 'unable') await step('unable', null, '(가짜 예시) 상담사 일정이 맞지 않음')
      for (const body of NOTES[i] ?? []) await tx`select counsel.rpc_add_purchase_note(${id}, ${body})`
    }
    // 예약 변경 이력 예시: 아자차 상담을 이틀 미룬다
    const [r] = await tx<{ id: string; version: number }[]>`
      select s.id, s.version from counsel.sessions s join counsel.naver_product_orders n on n.purchase_id = s.purchase_id
      where n.naver_product_order_id = ${productOrderIdOf(8)} and s.seq = 1`
    await tx`select counsel.rpc_update_session(${r.id}, ${r.version}, 'reschedule', '2026-10-16T15:00:00+09:00'::timestamptz, 'online', '(가짜 예시) 보호자 요청으로 비대면 변경')`
    for (const [name, list] of Object.entries(COUNSELORS)) {
      for (const [who, memo] of list) await tx`select counsel.rpc_save_counselor(${null}, ${1}, ${centerId(name)}, ${who}, ${memo}, ${true})`
    }
    for (const row of INBOX_ROWS) {
      await tx`select counsel.rpc_import_applications(${row.type}, ${tx.json([{ source_key: `seed|${row.app.client_name}`, application: row.app }])}::jsonb)`
    }
  })

  // 네이버 2차 수집: 취소 요청·취소 완료·일부 취소가 들어온다
  await intake(PURCHASES.flatMap((x, i) => (x.naver && x.later ? [naverDetail(x, i, 2)] : [])))

  // 검사 실시 현황(서랍 검사 코드 + 인싸이트 검사결과 API 자리). 같은 결제(주문번호)로 산 검사를 그 구매자 아래에 둔다.
  // 실시 완료 줄의 응시자 이름·결과지 주소는 결과 API가 준 것처럼 넣은 가짜 값이다(결과지는 example.com).
  const orderOf = (i: number) => `30261001${String(i + 1).padStart(8, '0')}`
  const exam = (i: number, n: number, test: string, status: string, name: string | null = null, done: string | null = null) => ({
    source_ref: `seed:${i}:${n}`, naver_order_id: orderOf(i), test_name: test, unit_no: n, exam_status: status,
    exam_started_at: status === 'unused' ? null : '2026-10-03T10:00:00+09:00', exam_completed_at: done,
    respondent_name: name, result_url: name ? `https://example.com/demo-result/${i}-${n}` : null,
  })
  const EXAMS = [
    // 가나다: 구매자 본인·남편·아이가 각각 검사를 마침
    exam(0, 1, 'STS 영아', 'completed', '가아기', '2026-09-26T20:00:00+09:00'),
    exam(0, 2, 'STS 성인확장', 'completed', '가엄마', '2026-09-27T21:10:00+09:00'),
    exam(0, 3, 'STS 성인확장', 'completed', '가아빠', '2026-09-28T09:30:00+09:00'),
    // 사아자: 예약 확정 뒤 취소, 검사는 시작 전
    exam(2, 1, 'MMPI-A 청소년 다면적 인성검사', 'unused'),
    // 차카타: 검사 응시 중
    exam(3, 1, 'K-CBCL 아동·청소년 행동평가척도', 'in_progress'),
    // 파하가: 신청서는 있고 검사는 시작 전
    exam(4, 1, 'K-WISC-V 아동 지능검사', 'unused'),
    // 마바사: 상담은 끝났는데 검사 기록이 없음 → 진행 단계에 '누락'
    exam(7, 1, 'SCT 문장완성검사', 'unused'),
    // 아자차: 예약 확정, 두 검사 중 하나만 마침
    exam(8, 1, 'TCI 기질 및 성격검사', 'completed', '아자차', '2026-10-06T19:00:00+09:00'),
    exam(8, 2, 'TCI 기질 및 성격검사', 'unused'),
    // 바사아: 공동구매, 아이 검사 마침
    exam(12, 1, '아동 기질검사', 'completed', '바아기', '2026-10-04T15:00:00+09:00'),
  ]
  const { error } = await admin.schema('counsel').rpc('rpc_sync_purchase_tests', { p_rows: EXAMS })
  if (error) throw new Error(`검사 현황 입구 실패: ${error.message} ${error.details ?? ''}`)
}

const sql = postgres(status.dbUrl, { max: 1, onnotice: () => {} })
// 빈 DB에 센터와 구매 건을 모두 이번에 넣었으면, 끝난 시각을 web/.demo/seeded-at.json 에 남긴다.
// 체험판(scripts/demo-snapshot.ts)은 이 시각 뒤에 바뀐 데이터가 하나도 없을 때만 만든다(시드가 아닌 자료가 섞이지 않게).
let centersSeeded = false
let purchasesSeeded = false
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
    centersSeeded = true
  }

  const [{ p, naverRows }] = await sql<{ p: number; naverRows: number }[]>`
    select (select count(*)::int from counsel.purchases) as p, (select count(*)::int from counsel.naver_product_orders) as "naverRows"`
  if (p > 0 && naverRows === 0) {
    throw new Error('중간에 멈춘 시드가 남아 있다. deno task db:reset 으로 처음부터 다시 넣는다')
  } else if (p > 0) {
    console.log('구매 건 데이터가 이미 있다')
  } else {
    await seedPurchases()
    console.log(`시드 완료: 구매 건 ${PURCHASES.length}건`)
    purchasesSeeded = true
  }
  if (centersSeeded && purchasesSeeded) {
    const [{ at }] = await sql<{ at: string }[]>`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at`
    const dir = new URL('../web/.demo/', import.meta.url)
    await Deno.mkdir(dir, { recursive: true })
    await Deno.writeTextFile(new URL('seeded-at.json', dir), JSON.stringify({ seededAt: at }))
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
