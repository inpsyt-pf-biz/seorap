import type { CodeResponse, LaunchResponse } from '../../_shared/core/apiTypes.ts'
import { lineStatus } from '../../_shared/core/lineStatus.ts'
import { decrypt } from '../../_shared/crypto.ts'
import { lineInputs } from '../lib/box.ts'
import { db, must } from '../lib/db.ts'
import { logEvent } from '../lib/events.ts'
import { ApiError, json, readJson } from '../lib/http.ts'
import { loadOwnedVoucher } from '../lib/ownership.ts'
import { requireSession } from '../lib/session.ts'
import { getSettings } from '../lib/settings.ts'

async function launchable(req: Request) {
  const sess = await requireSession(req)
  const { voucherId } = await readJson<{ voucherId: unknown }>(req)
  const v = await loadOwnedVoucher(voucherId, sess.recipientId)
  const li = (await lineInputs([v], await getSettings())).get(v.id)!
  const actions = lineStatus(li.input).actions
  if (!actions.includes('launch') && !actions.includes('continue')) throw new ApiError('CONFLICT', { reason: 'not_launchable' })
  if (!v.code_enc) throw new ApiError('CONFLICT', { reason: 'not_issued' })
  return { sess, v, code: await decrypt('B', v.code_enc) }
}

export async function voucherLaunch(req: Request): Promise<Response> {
  const { sess, v, code } = await launchable(req)
  must(await db().rpc('voucher_mark_exposed', { p_voucher_id: v.id, p_launch: true }), 'mark launch')
  await logEvent('voucher_launch', { recipientId: sess.recipientId, voucherId: v.id, orderId: v.order_id })
  const base = Deno.env.get('SEORAP_PLATFORM_TEST_URL') ?? 'https://inpsyt.co.kr/inpsyt/testing'
  const body: LaunchResponse = { url: `${base}/${encodeURIComponent(code)}` }
  return json(200, body)
}

export async function voucherCode(req: Request): Promise<Response> {
  const { sess, v, code } = await launchable(req)
  must(await db().rpc('voucher_mark_exposed', { p_voucher_id: v.id, p_launch: false }), 'mark code')
  await logEvent('voucher_code_reveal', { recipientId: sess.recipientId, voucherId: v.id, orderId: v.order_id })
  const body: CodeResponse = { code }
  return json(200, body)
}
