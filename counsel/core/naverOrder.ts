// 네이버 상품주문 값의 화면용 규칙. 코드값 뜻은 커머스API 문서 v2.90.1 기준이다.
// DB는 코드값에 CHECK 를 걸지 않으므로(20261012000004), 여기에 없는 새 코드는 원래 글자 그대로 보인다.
import { t, type CopyKey } from './copy.ko.ts'

export const PRODUCT_ORDER_STATUSES = [
  'PAYMENT_WAITING', 'PAYED', 'DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED', 'EXCHANGED', 'CANCELED', 'RETURNED', 'CANCELED_BY_NOPAYMENT',
] as const
export const CLAIM_TYPES = ['CANCEL', 'RETURN', 'EXCHANGE', 'PURCHASE_DECISION_HOLDBACK', 'ADMIN_CANCEL'] as const
export const CLAIM_STATUSES = [
  'CANCEL_REQUEST', 'CANCELING', 'CANCEL_DONE', 'CANCEL_REJECT', 'RETURN_REQUEST', 'EXCHANGE_REQUEST', 'COLLECTING', 'COLLECT_DONE',
  'EXCHANGE_REDELIVERING', 'RETURN_DONE', 'EXCHANGE_DONE', 'RETURN_REJECT', 'EXCHANGE_REJECT', 'PURCHASE_DECISION_HOLDBACK',
  'PURCHASE_DECISION_REQUEST', 'PURCHASE_DECISION_HOLDBACK_RELEASE', 'ADMIN_CANCELING', 'ADMIN_CANCEL_DONE', 'ADMIN_CANCEL_REJECT',
] as const
export const PLACE_ORDER_STATUSES = ['NOT_YET', 'OK', 'CANCEL'] as const
export const GIFT_RECEIVING_STATUSES = ['WAIT_FOR_RECEIVING', 'RECEIVED'] as const

const KINDS = {
  orderStatus: PRODUCT_ORDER_STATUSES,
  claimType: CLAIM_TYPES,
  claimStatus: CLAIM_STATUSES,
  placeOrder: PLACE_ORDER_STATUSES,
  gift: GIFT_RECEIVING_STATUSES,
} as const
export type NaverCodeKind = keyof typeof KINDS

export function naverCodeLabel(kind: NaverCodeKind, code: string | null | undefined): string | null {
  if (!code) return null
  return (KINDS[kind] as readonly string[]).includes(code) ? t(`naver.${kind}.${code}` as CopyKey) : code
}

// 목록에서 눈에 띄게 할 주문 상태: 취소·반품 쪽은 경고, 확정은 완료
export type OrderTone = 'normal' | 'done' | 'warning' | 'closed'
// 아직 끝나지 않은 취소·반품·교환·보류
const OPEN_CLAIMS: readonly string[] = [
  'CANCEL_REQUEST', 'CANCELING', 'RETURN_REQUEST', 'EXCHANGE_REQUEST', 'COLLECTING', 'COLLECT_DONE', 'EXCHANGE_REDELIVERING',
  'PURCHASE_DECISION_HOLDBACK', 'ADMIN_CANCELING',
]
export function orderTone(status: string | null, claimStatus: string | null): OrderTone {
  if (status === 'CANCELED' || status === 'RETURNED' || status === 'CANCELED_BY_NOPAYMENT') return 'closed'
  if (claimStatus && OPEN_CLAIMS.includes(claimStatus)) return 'warning'
  if (status === 'PURCHASE_DECIDED') return 'done'
  return 'normal'
}

// 목록 칸 하나에 보일 주문 상태 글자. 진행 중인 클레임이 있으면 그쪽을 보인다.
export function orderStatusText(status: string | null, claimStatus: string | null): string | null {
  return orderTone(status, claimStatus) === 'warning' ? naverCodeLabel('claimStatus', claimStatus) : naverCodeLabel('orderStatus', status)
}

// 상세 화면이 읽는 네이버 칸(구매 건 1건당 1줄)
export type NaverOrderInfo = {
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
  needs_review: boolean
  review_reason: string | null
  last_received_at: string | null
}

export const NAVER_ORDER_COLUMNS =
  'naver_product_order_id, external_order_id, ordered_at, naver_product_id, original_product_id, item_no, seller_product_code, option_name, '
  + 'quantity, remain_quantity, payment_amount, remain_payment_amount, product_order_status, claim_type, claim_status, claim_requested_at, '
  + 'place_order_status, decided_at, gift_receiving_status, inflow_path, closed_at, needs_review, review_reason, last_received_at'

export type NaverOrdererMasked = { name_masked: string | null; tel_masked: string | null }

export type NaverSettlement = {
  expected_settlement_amount: number | null
  payment_commission: number | null
  channel_commission: number | null
  sale_commission: number | null
  shopping_interlock_commission: number | null
}

export function won(n: number | null | undefined): string | null {
  return n === null || n === undefined ? null : t('naver.won', { n: n.toLocaleString('ko-KR') })
}
