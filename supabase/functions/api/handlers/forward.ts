import type { DirectShareResponse, ForwardResponse } from '../../_shared/core/apiTypes.ts'
import { t } from '../../_shared/core/copy.ko.ts'
import { checkForwardLimits } from '../../_shared/core/limits.ts'
import { lineStatus } from '../../_shared/core/lineStatus.ts'
import { last4, maskName, normalizePhone } from '../../_shared/core/phone.ts'
import { kstDayStart } from '../../_shared/core/time.ts'
import { encrypt, hmac, phoneHash, randomToken } from '../../_shared/crypto.ts'
import { lineInputs } from '../lib/box.ts'
import { db, must } from '../lib/db.ts'
import { logEvent } from '../lib/events.ts'
import { ApiError, json, readJson } from '../lib/http.ts'
import { publicBase, sendForwardMessage } from '../lib/messages.ts'
import { loadOwnedVoucher, type VoucherRow } from '../lib/ownership.ts'
import { requireSession, type Session } from '../lib/session.ts'
import { getSettings, type Settings } from '../lib/settings.ts'

type Body = { voucherId?: unknown; name?: unknown; phone?: unknown; clientRequestId?: unknown; confirmSelf?: unknown }
type ApplyRow = { out_forward_id: string; out_message_id: string | null; out_access_link_id: string | null; out_created: boolean }

const RPC_ERRORS: Record<string, string> = {
  ALREADY_FORWARDED: 'not_forwardable', NO_ACTIVE_FORWARD: 'no_active_forward', NOT_RESENDABLE: 'not_resendable', CODE_EXPOSED: 'code_exposed',
}

async function ctx(req: Request) {
  const sess = await requireSession(req)
  const body = await readJson<Body>(req)
  if (typeof body.clientRequestId !== 'string' || body.clientRequestId.length < 8 || body.clientRequestId.length > 64) {
    throw new ApiError('VALIDATION', { field: 'clientRequestId' })
  }
  const v = await loadOwnedVoucher(body.voucherId, sess.recipientId)
  const s = await getSettings()
  return { sess, body, v, s, clientRequestId: body.clientRequestId }
}

// 요청 ID 는 전체에서 하나뿐이지만, 앞 결과는 같은 발송권의 것만 돌려준다 (다른 발송권의 전달을 답으로 주지 않는다)
async function replay(clientRequestId: string, voucherId: string): Promise<ForwardResponse | null> {
  const data = must(
    await db().from('voucher_forwards').select('id').eq('client_request_id', clientRequestId).eq('voucher_id', voucherId).maybeSingle(),
    'forward replay read',
  ) as { id: string } | null
  return data ? { forwardId: data.id, created: false } : null
}

async function requireAction(v: VoucherRow, s: Settings, action: 'forward' | 'resend' | 'reforward') {
  const li = (await lineInputs([v], s)).get(v.id)!
  if (!lineStatus(li.input).actions.includes(action)) throw new ApiError('CONFLICT', { reason: action === 'forward' ? 'not_forwardable' : 'no_active_forward' })
}

async function apply(params: Record<string, unknown>): Promise<ApplyRow> {
  const { data, error } = await db().rpc('forward_apply', params)
  if (error) {
    const key = Object.keys(RPC_ERRORS).find((k) => error.message.includes(k))
    if (key) throw new ApiError('CONFLICT', { reason: RPC_ERRORS[key] })
    throw new Error(`forward_apply: ${error.message}`)
  }
  return (data as ApplyRow[])[0]
}

// 다시 보내기는 "못 받았어요"에 바로 응해야 하므로 같은 번호 간격(skipGap)을 적용하지 않는다
async function limits(sess: Session, v: VoucherRow, s: Settings, toPhoneHash: string, skipGap = false) {
  const now = new Date()
  // 조회 오류를 0건으로 바꾸면 한도를 그냥 통과하므로 must 로 502 를 올린다
  const c = (must(
    await db().rpc('forward_counts', {
      p_recipient_id: sess.recipientId, p_voucher_id: v.id, p_to_phone_hash: toPhoneHash, p_day_start: kstDayStart(now).toISOString(),
    }),
    'forward counts',
  ) as { out_voucher_today: number; out_box_today: number; out_last_same_number: string | null; out_unused: number }[])[0]
  const r = checkForwardLimits({
    now, voucherToday: c.out_voucher_today, boxToday: c.out_box_today,
    lastSameNumberAt: !skipGap && c.out_last_same_number ? new Date(c.out_last_same_number) : null, unusedCount: c.out_unused,
    settings: { perVoucherDay: s.forward_resend_per_voucher_day, sameNumberGapMin: s.forward_same_number_gap_min, perBoxDayMin: s.forward_per_box_day_min },
  })
  if (!r.ok) throw new ApiError('LIMIT_EXCEEDED', { reason: r.reason, retryAt: r.retryAt.toISOString() })
}

// 같은 요청 ID 가 동시에 두 번 오면 늦은 쪽은 상태 검사나 함수(중복 키)에서 막힌다. 그때 먼저 처리된 결과를 돌려준다.
async function orReplay(clientRequestId: string, voucherId: string, fn: () => Promise<ApplyRow>): Promise<ApplyRow | ForwardResponse> {
  try {
    return await fn()
  } catch (e) {
    const again = await replay(clientRequestId, voucherId)
    if (again) return again
    throw e
  }
}

async function senderMasked(recipientId: string): Promise<string> {
  const data = must(await db().from('recipients').select('name_masked').eq('id', recipientId).single(), 'sender read') as { name_masked: string | null }
  return data.name_masked ?? ''
}

export async function forwardCreate(req: Request): Promise<Response> {
  const { sess, body, v, s, clientRequestId } = await ctx(req)
  const done = await replay(clientRequestId, v.id)
  if (done) return json(200, done)

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 1 || name.length > 20) throw new ApiError('VALIDATION', { field: 'name' })
  const phone = typeof body.phone === 'string' ? normalizePhone(body.phone) : null
  if (!phone) throw new ApiError('VALIDATION', { field: 'phone' })
  const toHash = await phoneHash(phone)
  // 조회 오류를 "본인 번호 아님"으로 바꾸면 본인 번호 확인을 건너뛰므로 must 로 502 를 올린다
  const rec = must(await db().from('recipients').select('phone_hash').eq('id', sess.recipientId).single(), 'recipient read') as { phone_hash: string }
  const isSelf = rec.phone_hash === toHash
  // 보내는 분 이름은 전달을 반영하기 전에 읽는다 (반영 뒤에 읽다 실패하면 알림 없이 전달만 남는다)
  const sender = await senderMasked(sess.recipientId)

  const token = randomToken(32)
  const row = await orReplay(clientRequestId, v.id, async () => {
    await requireAction(v, s, 'forward')
    if (isSelf && body.confirmSelf !== true) throw new ApiError('CONFLICT', { reason: 'self_number' })
    await limits(sess, v, s, toHash)
    return await apply({
      p_action: 'forward', p_voucher_id: v.id, p_client_request_id: clientRequestId, p_actor_type: 'recipient',
      p_token_hash: await hmac(`forward:${token}`), p_link_ttl_days: s.forward_link_ttl_days,
      p_to_name_enc: await encrypt('A', name), p_to_name_masked: maskName(name),
      p_to_phone_enc: await encrypt('A', phone), p_to_phone_hash: toHash, p_to_phone_last4: last4(phone), p_is_self: isSelf,
    })
  })
  if ('forwardId' in row) return json(200, row)
  if (row.out_created) {
    await sendForwardMessage(row.out_forward_id, token, sender, s)
    await logEvent('forward_sent', { recipientId: sess.recipientId, voucherId: v.id, orderId: v.order_id })
  }
  const res: ForwardResponse = { forwardId: row.out_forward_id, created: row.out_created }
  return json(200, res)
}

export async function forwardResend(req: Request): Promise<Response> {
  const { sess, v, s, clientRequestId } = await ctx(req)
  const done = await replay(clientRequestId, v.id)
  if (done) return json(200, done)
  const sender = await senderMasked(sess.recipientId)
  const token = randomToken(32)
  const row = await orReplay(clientRequestId, v.id, async () => {
    await requireAction(v, s, 'resend')
    await limits(sess, v, s, '', true)
    return await apply({
      p_action: 'resend', p_voucher_id: v.id, p_client_request_id: clientRequestId, p_actor_type: 'recipient',
      p_token_hash: await hmac(`forward:${token}`), p_link_ttl_days: s.forward_link_ttl_days,
    })
  })
  if ('forwardId' in row) return json(200, row)
  if (row.out_created) {
    await sendForwardMessage(row.out_forward_id, token, sender, s)
    await logEvent('forward_sent', { recipientId: sess.recipientId, voucherId: v.id, props: { resend: true } })
  }
  return json(200, { forwardId: row.out_forward_id, created: row.out_created } satisfies ForwardResponse)
}

export async function forwardCancel(req: Request): Promise<Response> {
  const { sess, v, s, clientRequestId } = await ctx(req)
  const done = await replay(clientRequestId, v.id)
  if (done) return json(200, done)
  const row = await orReplay(clientRequestId, v.id, async () => {
    await requireAction(v, s, 'resend') // 전달 중인 줄인지 (다른 분께 가능 여부는 함수가 코드 노출로 판정)
    return await apply({
      p_action: 'cancel', p_voucher_id: v.id, p_client_request_id: clientRequestId, p_actor_type: 'recipient',
      p_token_hash: await hmac(`forward:${randomToken(32)}`), p_link_ttl_days: s.forward_link_ttl_days,
    })
  })
  if ('forwardId' in row) return json(200, row)
  await logEvent('forward_cancelled', { recipientId: sess.recipientId, voucherId: v.id })
  return json(200, { forwardId: row.out_forward_id, created: row.out_created } satisfies ForwardResponse)
}

export async function forwardDirect(req: Request): Promise<Response> {
  const { sess, v, s, clientRequestId } = await ctx(req)
  await requireAction(v, s, 'forward')
  // 토큰 원문은 저장하지 않으므로, 반영 뒤에 실패할 수 있는 읽기는 먼저 끝내 둔다
  const sender = await senderMasked(sess.recipientId)
  const token = randomToken(32)
  await apply({
    p_action: 'direct_share', p_voucher_id: v.id, p_client_request_id: clientRequestId, p_actor_type: 'recipient',
    p_token_hash: await hmac(`forward:${token}`), p_link_ttl_days: s.forward_link_ttl_days,
  })
  await logEvent('direct_share', { recipientId: sess.recipientId, voucherId: v.id })
  const url = `${publicBase()}/f/${token}`
  const res: DirectShareResponse = { url, text: t('forward.direct.text', { sender, url }) }
  return json(200, res)
}
