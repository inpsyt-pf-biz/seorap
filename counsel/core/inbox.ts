// 신청서 대기함: 구글시트 줄 가운데 맞는 구매 건을 찾지 못한 줄. 사람이 붙일 구매 건을 고를 수 있게 후보를 고른다.
// 원문 연락처는 대기함에만 있고 네이버 주문자 연락처는 가린 값(끝 4자리)만 읽을 수 있으므로, 끝 4자리·가린 이름·날짜로 견준다.
import type { PurchaseRow, PurchaseType } from './purchases.ts'

export type InboxItem = {
  id: string
  purchase_type: PurchaseType
  submitted_at: string | null
  client_name: string | null
  guardian_name: string | null
  client_phone: string | null
  guardian_phone: string | null
  test_name: string | null
  naver_product_order_id: string | null
  created_at: string
}

export const INBOX_COLUMNS =
  'id, purchase_type, submitted_at, client_name, guardian_name, client_phone, guardian_phone, test_name, naver_product_order_id, created_at'

const last4 = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length >= 4 ? d.slice(-4) : null
}

// 가린 이름(김*시)이 이름과 맞는지: 길이, 첫 글자, 끝 글자
export function maskedNameMatches(masked: string | null | undefined, name: string | null | undefined): boolean {
  if (!masked || !name) return false
  const n = name.trim()
  if (masked.length !== n.length) return false
  return masked[0] === n[0] && (n.length < 3 || masked[masked.length - 1] === n[n.length - 1])
}

export type Candidate = { purchase: PurchaseRow; score: number; reasons: ('phone' | 'name' | 'type' | 'date')[] }

const DAY = 24 * 60 * 60 * 1000

// 신청서가 아직 없는 구매 건 가운데 점수가 높은 순으로 3건. 연락처 끝 4자리 3점, 이름 2점, 구분 1점, 결제 뒤 14일 안 신청 1점.
// 연락처나 이름이 하나라도 맞아야 후보가 된다.
export function inboxCandidates(item: InboxItem, purchases: PurchaseRow[], limit = 3): Candidate[] {
  const phones = [last4(item.client_phone), last4(item.guardian_phone)].filter(Boolean)
  const out: Candidate[] = []
  for (const p of purchases) {
    if (p.applications) continue
    const reasons: Candidate['reasons'] = []
    let score = 0
    const tel = last4(p.naver_orderers?.tel_masked)
    if (tel && phones.includes(tel)) { score += 3; reasons.push('phone') }
    const masked = p.naver_orderers?.name_masked
    if (maskedNameMatches(masked, item.guardian_name) || maskedNameMatches(masked, item.client_name)) { score += 2; reasons.push('name') }
    if (score === 0) continue
    if (p.purchase_type === item.purchase_type) { score += 1; reasons.push('type') }
    if (item.submitted_at && p.paid_at) {
      const gap = Date.parse(item.submitted_at) - Date.parse(p.paid_at)
      if (gap >= -DAY && gap <= 14 * DAY) { score += 1; reasons.push('date') }
    }
    out.push({ purchase: p, score, reasons })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}
