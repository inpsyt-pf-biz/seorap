import { assertEquals } from '@std/assert'
import { closedAt, maskOrderer, toIntakeParts, type NaverProductOrderDetail } from './naverIntake.ts'
import {
  CLAIM_STATUSES, CLAIM_TYPES, GIFT_RECEIVING_STATUSES, PLACE_ORDER_STATUSES, PRODUCT_ORDER_STATUSES,
  naverCodeLabel, orderStatusText, orderTone, won,
} from './naverOrder.ts'

// 커머스API '상품 주문 상세 내역 조회' data[n] 모양의 가짜 응답(값은 지어낸 것)
const paid: NaverProductOrderDetail = {
  order: {
    orderId: '2026101012345678', orderDate: '2026-10-10T10:00:00.000+09:00', paymentDate: '2026-10-10T10:01:00.000+09:00',
    ordererName: '김예시', ordererTel: '010-0000-1234', ordererNo: '9990001',
  },
  productOrder: {
    productOrderId: '2026101087654321', productOrderStatus: 'PAYED', placeOrderStatus: 'NOT_YET',
    productId: '9000000001', originalProductId: '8000000001', itemNo: '7000000001', sellerProductCode: 'CBCL-PKG',
    productName: 'K-CBCL 검사 + 해석상담', productOption: '상담 방식: 대면', quantity: 2, initialQuantity: 2, remainQuantity: 2,
    totalPaymentAmount: 180000, initialPaymentAmount: 180000, remainPaymentAmount: 180000, inflowPath: '네이버 쇼핑',
    shippingMemo: '평일 오후 연락 부탁드려요', expectedSettlementAmount: 170000, paymentCommission: 5000, channelCommission: 3000,
  },
}

Deno.test('네이버 응답 → 원장 줄: 칸 이름, 수량·금액은 주문 시점 값, 정산', () => {
  const r = toIntakeParts(paid, '2026-10-12T00:00:00.000+09:00')
  assertEquals(r.naver.naver_product_order_id, '2026101087654321')
  assertEquals(r.naver.external_order_id, '2026101012345678')
  assertEquals([r.naver.item_no, r.naver.option_name, r.naver.quantity, r.naver.payment_amount], ['7000000001', '상담 방식: 대면', 2, 180000])
  assertEquals([r.naver.product_order_status, r.naver.claim_status, r.naver.closed_at], ['PAYED', null, null])
  assertEquals(r.purchase, { product_name: 'K-CBCL 검사 + 해석상담', paid_at: '2026-10-10T10:01:00.000+09:00', purchase_memo: '평일 오후 연락 부탁드려요' })
  assertEquals(r.settlement?.expected_settlement_amount, 170000)
  assertEquals(r.settlement?.sale_commission, null)
  assertEquals(r.ordererPlain, { name: '김예시', tel: '010-0000-1234', ordererNo: '9990001' })
})

Deno.test('일부 취소: 남은 수량·현재 금액, 클레임 요청 일시', () => {
  const partial: NaverProductOrderDetail = {
    ...paid,
    productOrder: { ...paid.productOrder, claimType: 'CANCEL', claimStatus: 'CANCEL_DONE', remainQuantity: 1, remainPaymentAmount: 90000 },
    currentClaim: { cancel: { claimRequestDate: '2026-10-11T09:00:00.000+09:00', cancelCompletedDate: '2026-10-11T10:00:00.000+09:00' } },
  }
  const r = toIntakeParts(partial, '2026-10-12T00:00:00.000+09:00').naver
  // 수량 일부 취소가 끝나도 주문 상태는 결제 완료로 남는다
  assertEquals([r.product_order_status, r.remain_quantity, r.remain_payment_amount, r.quantity], ['PAYED', 1, 90000, 2])
  assertEquals(r.claim_requested_at, '2026-10-11T09:00:00.000+09:00')
  assertEquals(r.closed_at, null)
})

Deno.test('거래 종료 시각: 구매 확정·취소 완료·반품 완료, 없으면 받은 시각', () => {
  const at = '2026-10-12T00:00:00.000+09:00'
  const po = paid.productOrder
  assertEquals(closedAt({ productOrder: { ...po, productOrderStatus: 'PURCHASE_DECIDED', decisionDate: '2026-10-11T00:00:00+09:00' } }, at), '2026-10-11T00:00:00+09:00')
  assertEquals(closedAt({ productOrder: { ...po, productOrderStatus: 'CANCELED' }, currentClaim: { cancel: { cancelCompletedDate: 'X' } } }, at), 'X')
  assertEquals(closedAt({ productOrder: { ...po, productOrderStatus: 'RETURNED' } }, at), at)
  assertEquals(closedAt({ productOrder: { ...po, productOrderStatus: 'DELIVERED' } }, at), null)
})

Deno.test('선물하기 주문은 주문자 정보가 없다', () => {
  const gift: NaverProductOrderDetail = { order: { orderId: '1' }, productOrder: { productOrderId: '2', giftReceivingStatus: 'WAIT_FOR_RECEIVING' } }
  const r = toIntakeParts(gift, '2026-10-12T00:00:00.000+09:00')
  assertEquals(r.ordererPlain, null)
  assertEquals(r.settlement, null)
  assertEquals(r.naver.gift_receiving_status, 'WAIT_FOR_RECEIVING')
})

Deno.test('주문자 가리기: 서랍과 같은 규칙, 휴대폰이 아니면 끝 4자리', () => {
  assertEquals(maskOrderer({ name: '김예시', tel: '010-0000-1234', ordererNo: null }), { name_masked: '김*시', tel_masked: '010-****-1234', tel_digits: '01000001234' })
  assertEquals(maskOrderer({ name: '이샘', tel: '0504-1234-5678', ordererNo: null }), { name_masked: '이*', tel_masked: '***-****-5678', tel_digits: '050412345678' })
  assertEquals(maskOrderer({ name: null, tel: null, ordererNo: null }), { name_masked: null, tel_masked: null, tel_digits: null })
})

Deno.test('코드값 이름표: 모든 코드에 한글 이름이 있고, 모르는 코드는 그대로', () => {
  for (const c of PRODUCT_ORDER_STATUSES) assertEquals(naverCodeLabel('orderStatus', c) !== c, true)
  for (const c of CLAIM_TYPES) assertEquals(naverCodeLabel('claimType', c) !== c, true)
  for (const c of CLAIM_STATUSES) assertEquals(naverCodeLabel('claimStatus', c) !== c, true)
  for (const c of PLACE_ORDER_STATUSES) assertEquals(naverCodeLabel('placeOrder', c) !== c, true)
  for (const c of GIFT_RECEIVING_STATUSES) assertEquals(naverCodeLabel('gift', c) !== c, true)
  assertEquals(naverCodeLabel('orderStatus', 'NEW_CODE'), 'NEW_CODE')
  assertEquals(naverCodeLabel('orderStatus', null), null)
  assertEquals(won(180000), '180,000원')
})

Deno.test('목록의 주문 상태: 진행 중 클레임이 먼저 보이고, 끝난 주문은 닫힘', () => {
  assertEquals([orderTone('PAYED', 'CANCEL_REQUEST'), orderStatusText('PAYED', 'CANCEL_REQUEST')], ['warning', '취소 요청'])
  assertEquals([orderTone('PAYED', 'CANCEL_REJECT'), orderStatusText('PAYED', 'CANCEL_REJECT')], ['normal', '결제 완료'])
  assertEquals(orderTone('CANCELED', 'CANCEL_DONE'), 'closed')
  assertEquals(orderTone('PURCHASE_DECIDED', null), 'done')
})
