import { db } from './db.ts'

// ipHash: 접속 주소의 hmac. 원래 주소는 남기지 않는다 (로그인 시도 수 세기에만 쓴다)
export async function logEvent(name: string, f: { recipientId?: string; orderId?: string; voucherId?: string; sessionIdHash?: string; ipHash?: string | null; props?: Record<string, unknown> } = {}) {
  await db().from('events').insert({
    name,
    recipient_id: f.recipientId ?? null,
    order_id: f.orderId ?? null,
    voucher_id: f.voucherId ?? null,
    session_id_hash: f.sessionIdHash ?? null,
    ip_hash: f.ipHash ?? null,
    props: f.props ?? {},
  })
}
