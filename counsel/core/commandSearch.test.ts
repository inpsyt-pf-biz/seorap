import { assertEquals } from '@std/assert'
import { matchPurchase, matchText } from './commandSearch.ts'

const r = {
  product_name: 'STS 커플 기질검사 + 해석상담',
  applications: {
    client_name: '김예시', client_phone: '010-1234-5678', guardian_name: '박보호', guardian_phone: '010-9999-0000',
    test_name: null, submitted_at: null, residence: null, preferred_method: null, preferred_schedule: null,
  },
  naver_orderers: { name_masked: '김*시', tel_masked: '010-****-5678' },
  naver_product_orders: { naver_product_order_id: '2026101921140381', product_order_status: 'PAYED', claim_status: null, option_name: null, needs_review: false },
}

Deno.test('글자 찾기: 띄어쓰기·대소문자 무시, 빈 검색어는 모두', () => {
  assertEquals(matchText('신청서 템플릿', '신청서템플릿'), true)
  assertEquals(matchText('sts', 'STS 기질'), true)
  assertEquals(matchText('', '아무거나'), true)
  assertEquals(matchText('없음', '구매 건', null), false)
})

Deno.test('구매 건 찾기: 이름·보호자·상품, 숫자는 4자리 이상으로 연락처·주문번호', () => {
  assertEquals(matchPurchase('김예', r), true)
  assertEquals(matchPurchase('박보호', r), true)
  assertEquals(matchPurchase('커플', r), true)
  assertEquals(matchPurchase('5678', r), true)
  assertEquals(matchPurchase('1234-5678', r), true)
  assertEquals(matchPurchase('9999', r), true)
  assertEquals(matchPurchase('2026101921140381', r), true)
  assertEquals(matchPurchase('567', r), false)
  assertEquals(matchPurchase('', r), false)
  // 숫자와 글자가 섞이면 글자 찾기만(연락처에 우연히 맞지 않게)
  assertEquals(matchPurchase('5678번', r), false)
})
