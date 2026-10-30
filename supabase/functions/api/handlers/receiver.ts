import type { CodeResponse, ForwardPageResponse, HelpResponse, LaunchResponse } from '../../_shared/core/apiTypes.ts'
import { decrypt, hmac } from '../../_shared/crypto.ts'
import { db, must } from '../lib/db.ts'
import { logEvent } from '../lib/events.ts'
import { ApiError, json, readJson } from '../lib/http.ts'
import { TOKEN_RE } from '../lib/links.ts'
import { platformTestUrl } from '../lib/platform.ts'
import { loadHelp } from '../lib/help.ts'

// 받는 분 1매 화면 (build-spec §4-7). 세션 없이 링크 토큰만으로 연다.
// 링크를 여는 것(forward/page)은 아무것도 기록하지 않는다: 카카오톡 미리보기 봇이 먼저 열기 때문이다.
// [실시하기]·[코드 보기]를 누른 순간 forward_link_use 가 잠금 아래에서 상태를 다시 보고 기록한다.

async function tokenHash(req: Request): Promise<string> {
  const { token } = await readJson<{ token: unknown }>(req)
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new ApiError('LINK_INVALID')
  return hmac(`forward:${token}`)
}

function refuse(status: string): never {
  if (status === 'invalid') throw new ApiError('LINK_INVALID')
  // 막힌 사유는 화면 문구를 고르는 데 쓴다 (forward.revoked.*)
  throw new ApiError('LINK_REVOKED', { reason: status })
}

export async function forwardPage(req: Request): Promise<Response> {
  const rows = must(await db().rpc('forward_link_peek', { p_token_hash: await tokenHash(req) }), 'forward peek') as
    { out_status: string; out_test_name: string; out_sender_masked: string | null; out_launched: boolean }[]
  const r = rows?.[0]
  if (!r) refuse('invalid')
  if (r.out_status !== 'ok') refuse(r.out_status)
  const body: ForwardPageResponse = {
    senderName: r.out_sender_masked ?? '', testName: r.out_test_name, launched: r.out_launched, contact: (await loadHelp()).contact,
  }
  return json(200, body)
}

async function use(req: Request, launch: boolean): Promise<{ voucherId: string; code: string }> {
  const rows = must(await db().rpc('forward_link_use', { p_token_hash: await tokenHash(req), p_launch: launch }), 'forward use') as
    { out_status: string; out_voucher_id: string | null }[]
  const r = rows?.[0]
  if (!r || r.out_status !== 'ok' || !r.out_voucher_id) refuse(r?.out_status ?? 'invalid')
  const v = must(await db().from('vouchers').select('code_enc').eq('id', r.out_voucher_id).single(), 'forward voucher read') as { code_enc: string | null }
  if (!v.code_enc) refuse('unavailable')
  return { voucherId: r.out_voucher_id, code: await decrypt('B', v.code_enc) }
}

export async function forwardLaunch(req: Request): Promise<Response> {
  const { voucherId, code } = await use(req, true)
  await logEvent('forward_launch', { voucherId })
  const body: LaunchResponse = { url: platformTestUrl(code) }
  return json(200, body)
}

// 도움말 화면 (세션 없이). 상담 어드민에서 고친 질문·답·버튼·문의처 (10-30). 받는 분 화면도 같은 문의처
export async function help(_req: Request): Promise<Response> {
  const body: HelpResponse = await loadHelp()
  return json(200, body)
}

export async function forwardCode(req: Request): Promise<Response> {
  const { voucherId, code } = await use(req, false)
  await logEvent('forward_code_reveal', { voucherId })
  const body: CodeResponse = { code }
  return json(200, body)
}
