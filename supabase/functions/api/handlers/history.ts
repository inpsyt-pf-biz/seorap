import { buildHistory } from '../lib/box.ts'
import { json } from '../lib/http.ts'
import { requireSession } from '../lib/session.ts'
import { getSettings } from '../lib/settings.ts'

export async function history(req: Request): Promise<Response> {
  const sess = await requireSession(req)
  return json(200, await buildHistory(sess.recipientId, await getSettings()))
}
