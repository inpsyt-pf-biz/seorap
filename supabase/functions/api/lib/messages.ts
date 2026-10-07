import { mockAdapters } from '../../_shared/adapters/mock.ts'
import { decrypt } from '../../_shared/crypto.ts'
import { db, must } from './db.ts'
import type { Settings } from './settings.ts'

export function publicBase(): string {
  return (Deno.env.get('SEORAP_PUBLIC_BASE') ?? 'http://localhost:5173').replace(/\/$/, '')
}

// 받는 분 알림(T2). 토큰 원문은 저장하지 않으므로 호출하는 쪽이 넘긴다.
export async function sendForwardMessage(forwardId: string, token: string, senderMasked: string, s: Settings) {
  // 조회 오류를 "보낼 것 없음"으로 바꾸면 알림이 조용히 빠지므로 must 로 502 를 올린다
  const f = must(
    await db().from('voucher_forwards').select('message_id, to_name_enc, to_phone_enc').eq('id', forwardId).single(),
    'forward message read',
  ) as { message_id: string | null; to_name_enc: string | null; to_phone_enc: string | null }
  if (!f.message_id || !f.to_phone_enc) return
  const adapters = mockAdapters(db(), s.mock_message_mode)
  await adapters.message.send({
    messageId: f.message_id,
    purpose: 't2_forward',
    toPhone: await decrypt('A', f.to_phone_enc),
    templateCode: 't2_forward',
    variables: { receiver: f.to_name_enc ? await decrypt('A', f.to_name_enc) : '', sender: senderMasked },
    buttonUrl: `${publicBase()}/f/${token}`,
    fallbackSms: true,
  })
}
