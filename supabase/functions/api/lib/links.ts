import { hmac } from '../../_shared/crypto.ts'
import { db, must } from './db.ts'
import { ApiError } from './http.ts'

export const TOKEN_RE = /^[A-Za-z0-9]{32}$/

export type BoxLink = { id: string; recipient_id: string; revoked_at: string | null; revoked_reason: string | null }
export type RecipientRow = { id: string; phone_enc: string; phone_hash: string; phone_last4: string; name_enc: string | null; name_masked: string | null; status: string }

export async function findBoxLink(token: unknown): Promise<{ link: BoxLink; recipient: RecipientRow }> {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new ApiError('LINK_INVALID')
  // 조회 오류는 502(must)로 올리고, "행 없음"만 LINK_INVALID 로 처리한다
  const link = must(
    await db().from('access_links')
      .select('id, recipient_id, revoked_at, revoked_reason')
      .eq('token_hash', await hmac(`box:${token}`)).eq('link_type', 'box').maybeSingle(),
    'box link read',
  ) as BoxLink | null
  if (!link) throw new ApiError('LINK_INVALID')
  if (link.revoked_at) throw new ApiError('LINK_REVOKED', { reason: link.revoked_reason })
  const recipient = must(
    await db().from('recipients')
      .select('id, phone_enc, phone_hash, phone_last4, name_enc, name_masked, status').eq('id', link.recipient_id).maybeSingle(),
    'recipient read',
  ) as RecipientRow | null
  if (!recipient || recipient.status !== 'active') throw new ApiError('FORBIDDEN', { reason: 'blocked' })
  return { link, recipient }
}
