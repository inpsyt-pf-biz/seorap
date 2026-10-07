import type { DevOutboxItem } from '../../_shared/core/apiTypes.ts'
import { isDevEnv } from '../../_shared/env.ts'
import { db } from '../lib/db.ts'
import { ApiError, json } from '../lib/http.ts'

export async function devOutbox(): Promise<Response> {
  if (!isDevEnv()) throw new ApiError('FORBIDDEN')
  const { data } = await db().from('dev_outbox').select('id, created_at, kind, to_phone_last4, body').order('created_at', { ascending: false }).limit(30)
  const items: DevOutboxItem[] = (data ?? []).map((r) => ({ id: r.id, createdAt: r.created_at, kind: r.kind, toLast4: r.to_phone_last4, body: r.body }))
  return json(200, { items })
}
