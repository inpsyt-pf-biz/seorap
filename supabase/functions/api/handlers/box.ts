import { buildBox } from '../lib/box.ts'
import { logEvent } from '../lib/events.ts'
import { json } from '../lib/http.ts'
import { requireSession } from '../lib/session.ts'
import { getSettings } from '../lib/settings.ts'

export async function box(req: Request): Promise<Response> {
  const sess = await requireSession(req)
  const body = await buildBox(sess.recipientId, await getSettings())
  await logEvent('box_view', { recipientId: sess.recipientId, sessionIdHash: sess.idHash })
  return json(200, body)
}
