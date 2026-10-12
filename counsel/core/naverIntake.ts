// 네이버 '상품 주문 상세 내역 조회' 응답의 data[n] 한 개를 상담 원장 입구(rpc_intake_naver_product_orders)가 받는 줄로 바꾼다.
// 연동 프로그램(서버)에서만 쓴다. 주문자 원문은 여기서 꺼내기만 하고, 암호화·HMAC 은 부르는 쪽이 키를 들고 한다.
// 필드 이름은 커머스API 문서 v2.90.1 기준. optionCode 는 2026-07-22에 없어져 itemNo 를 쓰고,
// 클레임은 2026-10-28 이후 구조(currentClaim)를 읽는다.
import { maskName, maskPhone, normalizePhone } from '../../supabase/functions/_shared/core/phone.ts'

type ClaimNode = {
  claimRequestDate?: string
  cancelCompletedDate?: string
  returnCompletedDate?: string
}

// 응답에서 이 원장이 읽는 필드만 적었다. 값이 없는 필드는 응답 JSON 에서 아예 빠진다.
export type NaverProductOrderDetail = {
  order?: {
    orderId?: string
    orderDate?: string
    paymentDate?: string
    ordererName?: string
    ordererTel?: string
    ordererNo?: string
  }
  productOrder: {
    productOrderId: string
    productOrderStatus?: string
    claimType?: string
    claimStatus?: string
    placeOrderStatus?: string
    decisionDate?: string
    productId?: string
    originalProductId?: string
    itemNo?: string
    sellerProductCode?: string
    productName?: string
    productOption?: string
    quantity?: number
    initialQuantity?: number
    remainQuantity?: number
    totalPaymentAmount?: number
    initialPaymentAmount?: number
    remainPaymentAmount?: number
    giftReceivingStatus?: string
    inflowPath?: string
    shippingMemo?: string
    expectedSettlementAmount?: number
    paymentCommission?: number
    channelCommission?: number
    saleCommission?: number
    knowledgeShoppingSellingInterlockCommission?: number
  }
  currentClaim?: { cancel?: ClaimNode; return?: ClaimNode; exchange?: ClaimNode }
}

export type NaverIntakeNaver = {
  naver_product_order_id: string
  external_order_id: string | null
  ordered_at: string | null
  naver_product_id: string | null
  original_product_id: string | null
  item_no: string | null
  seller_product_code: string | null
  option_name: string | null
  quantity: number | null
  remain_quantity: number | null
  payment_amount: number | null
  remain_payment_amount: number | null
  product_order_status: string | null
  claim_type: string | null
  claim_status: string | null
  claim_requested_at: string | null
  place_order_status: string | null
  decided_at: string | null
  gift_receiving_status: string | null
  inflow_path: string | null
  closed_at: string | null
}

export type OrdererPlain = { name: string | null; tel: string | null; ordererNo: string | null }

export type OrdererProtected = {
  name_enc: string | null
  name_masked: string | null
  tel_enc: string | null
  tel_masked: string | null
  tel_hash: string | null
  orderer_no_hash: string | null
}

export type NaverIntakeRow = {
  naver: NaverIntakeNaver
  purchase: { product_name: string | null; paid_at: string | null; purchase_memo: string | null }
  orderer: OrdererProtected | null
  settlement: {
    expected_settlement_amount: number | null
    payment_commission: number | null
    channel_commission: number | null
    sale_commission: number | null
    shopping_interlock_commission: number | null
  } | null
}

const v = <T>(x: T | undefined): T | null => (x === undefined || x === '' ? null : x)

// 거래 종료 시각. 네이버가 주문자 정보를 가리는 기준(구매 확정·취소 완료·반품 완료·미결제 취소 후 61일)과 같다.
// 완료 일시가 응답에 없으면 받은 시각으로 둔다.
export function closedAt(d: NaverProductOrderDetail, receivedAt: string): string | null {
  const p = d.productOrder
  switch (p.productOrderStatus) {
    case 'PURCHASE_DECIDED': return p.decisionDate ?? receivedAt
    case 'CANCELED': return d.currentClaim?.cancel?.cancelCompletedDate ?? receivedAt
    case 'RETURNED': return d.currentClaim?.return?.returnCompletedDate ?? receivedAt
    case 'CANCELED_BY_NOPAYMENT': return receivedAt
    default: return null
  }
}

function claimRequestedAt(d: NaverProductOrderDetail): string | null {
  const c = d.currentClaim
  const byType = d.productOrder.claimType === 'RETURN' ? c?.return : d.productOrder.claimType === 'EXCHANGE' ? c?.exchange : c?.cancel
  return byType?.claimRequestDate ?? c?.cancel?.claimRequestDate ?? c?.return?.claimRequestDate ?? c?.exchange?.claimRequestDate ?? null
}

export function toIntakeParts(d: NaverProductOrderDetail, receivedAt: string): Omit<NaverIntakeRow, 'orderer'> & { ordererPlain: OrdererPlain | null } {
  const p = d.productOrder
  const o = d.order ?? {}
  const hasSettlement = [p.expectedSettlementAmount, p.paymentCommission, p.channelCommission, p.saleCommission, p.knowledgeShoppingSellingInterlockCommission]
    .some((x) => x !== undefined)
  // 선물하기 주문은 주문자 정보가 오지 않는다
  const ordererPlain = o.ordererName || o.ordererTel ? { name: v(o.ordererName), tel: v(o.ordererTel), ordererNo: v(o.ordererNo) } : null
  return {
    naver: {
      naver_product_order_id: p.productOrderId,
      external_order_id: v(o.orderId),
      ordered_at: v(o.orderDate),
      naver_product_id: v(p.productId),
      original_product_id: v(p.originalProductId),
      item_no: v(p.itemNo),
      seller_product_code: v(p.sellerProductCode),
      option_name: v(p.productOption),
      quantity: v(p.initialQuantity) ?? v(p.quantity),
      remain_quantity: v(p.remainQuantity),
      payment_amount: v(p.initialPaymentAmount) ?? v(p.totalPaymentAmount),
      remain_payment_amount: v(p.remainPaymentAmount),
      product_order_status: v(p.productOrderStatus),
      claim_type: v(p.claimType),
      claim_status: v(p.claimStatus),
      claim_requested_at: claimRequestedAt(d),
      place_order_status: v(p.placeOrderStatus),
      decided_at: v(p.decisionDate),
      gift_receiving_status: v(p.giftReceivingStatus),
      inflow_path: v(p.inflowPath),
      closed_at: closedAt(d, receivedAt),
    },
    purchase: { product_name: v(p.productName), paid_at: v(o.paymentDate), purchase_memo: v(p.shippingMemo) },
    settlement: hasSettlement
      ? {
        expected_settlement_amount: v(p.expectedSettlementAmount),
        payment_commission: v(p.paymentCommission),
        channel_commission: v(p.channelCommission),
        sale_commission: v(p.saleCommission),
        shopping_interlock_commission: v(p.knowledgeShoppingSellingInterlockCommission),
      }
      : null,
    ordererPlain,
  }
}

// 가린 이름·번호. 서랍과 같은 규칙(김*시, 010-****-5678). 휴대폰 형식이 아니면 끝 4자리만 남긴다.
export function maskOrderer(plain: OrdererPlain): { name_masked: string | null; tel_masked: string | null; tel_digits: string | null } {
  const digits = plain.tel ? plain.tel.replace(/\D/g, '') : ''
  const mobile = plain.tel ? normalizePhone(plain.tel) : null
  return {
    name_masked: plain.name ? maskName(plain.name) : null,
    tel_masked: mobile ? maskPhone(mobile) : digits ? `***-****-${digits.slice(-4)}` : null,
    tel_digits: mobile ?? (digits || null),
  }
}
