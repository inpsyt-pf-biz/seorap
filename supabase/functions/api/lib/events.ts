import { db } from './db.ts'

export async function logEvent(name: string, f: { recipientId?: string; orderId?: string; voucherId?: string; sessionIdHash?: string; props?: Record<string, unknown> } = {}) {
  await db().from('events').insert({
    name,
    recipient_id: f.recipientId ?? null,
    order_id: f.orderId ?? null,
    voucher_id: f.voucherId ?? null,
    session_id_hash: f.sessionIdHash ?? null,
    props: f.props ?? {},
  })
}
