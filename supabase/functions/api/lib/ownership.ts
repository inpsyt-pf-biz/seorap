import { db, must } from './db.ts'
import { ApiError } from './http.ts'

export const VOUCHER_COLS = 'id, order_id, order_item_id, test_item_id, test_name, unit_no, created_at, issue_status, cancel_status, exam_status, lock_reasons, first_launched_at, platform_deleted_at, current_forward_id, code_enc'
export type VoucherRow = {
  id: string; order_id: string; order_item_id: string; test_item_id: string; test_name: string; unit_no: number; created_at: string
  issue_status: 'pending' | 'issued' | 'failed' | 'voided' | 'replaced'
  cancel_status: 'none' | 'checking' | 'cancelled' | 'rejected'
  exam_status: null | 'unused' | 'in_progress' | 'completed' | 'deleted'
  lock_reasons: string[]; first_launched_at: string | null; platform_deleted_at: string | null
  current_forward_id: string | null; code_enc: string | null
}

// 남의 발송권과 없는 발송권을 똑같이 거부한다 (Review Focus 5)
export async function loadOwnedVoucher(voucherId: unknown, recipientId: string): Promise<VoucherRow> {
  if (typeof voucherId !== 'string' || !/^[0-9a-f-]{36}$/i.test(voucherId)) throw new ApiError('NOT_OWNER')
  // 조회 오류는 502(must)로 올리고, "행 없음"·"남의 것"만 NOT_OWNER 로 처리한다
  const data = must(
    await db().from('vouchers').select(`${VOUCHER_COLS}, orders!inner(recipient_id)`).eq('id', voucherId).maybeSingle(),
    'voucher owner read',
  )
  const owner = (data as unknown as { orders: { recipient_id: string } } | null)?.orders?.recipient_id
  if (!data || owner !== recipientId) throw new ApiError('NOT_OWNER')
  return data as unknown as VoucherRow
}
