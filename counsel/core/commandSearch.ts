// Ctrl+K 명령 팔레트의 찾기 규칙. 글자는 띄어쓰기·대소문자를 무시하고, 숫자는 하이픈 없이 4자리 이상일 때
// 연락처·상품주문번호에 맞춰 본다(목록의 검색과 같은 기준).
import type { PurchaseRow } from './purchases.ts'

export const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '')
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

// 글자 칸 중 하나라도 검색어를 품으면 맞다. 검색어가 비면 모두 맞다
export function matchText(q: string, ...fields: (string | null | undefined)[]): boolean {
  const n = normalize(q)
  return !n || fields.some((f) => !!f && normalize(f).includes(n))
}

export function matchPurchase(q: string, r: Pick<PurchaseRow, 'applications' | 'naver_orderers' | 'naver_product_orders' | 'product_name'>): boolean {
  if (!normalize(q)) return false
  const a = r.applications
  if (matchText(q, a?.client_name, a?.guardian_name, r.naver_orderers?.name_masked, r.product_name)) return true
  const d = digits(q)
  if (d.length < 4 || d.length !== q.replace(/[\s-]/g, '').length) return false
  return [a?.client_phone, a?.guardian_phone, r.naver_product_orders?.naver_product_order_id].some((x) => digits(x).includes(d))
}
