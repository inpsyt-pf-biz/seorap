import type { DevOutboxItem } from '../../_shared/core/apiTypes.ts'
import { devOutboxAllowed, isDevEnv } from '../../_shared/env.ts'
import { db } from '../lib/db.ts'
import { ApiError, json } from '../lib/http.ts'

// 함수 주소(supabase.co)는 Vercel 보호를 거치지 않는다. 로컬이 아니면 함수 비밀값과 같은 키 머리글이 있어야 연다.
export async function devOutbox(req: Request): Promise<Response> {
  if (!isDevEnv()) throw new ApiError('FORBIDDEN')
  if (!devOutboxAllowed(Deno.env.get('SEORAP_ENV'), Deno.env.get('SEORAP_DEV_OUTBOX_KEY'), req.headers.get('x-seorap-dev-key'))) {
    throw new ApiError('FORBIDDEN')
  }
  const { data } = await db().from('dev_outbox').select('id, created_at, kind, to_phone_last4, body').order('created_at', { ascending: false }).limit(30)
  const items: DevOutboxItem[] = (data ?? []).map((r) => ({ id: r.id, createdAt: r.created_at, kind: r.kind, toLast4: r.to_phone_last4, body: r.body }))
  return json(200, { items })
}
