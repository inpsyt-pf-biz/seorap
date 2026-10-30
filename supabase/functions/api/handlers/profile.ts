import type { ProfileResponse } from '../../_shared/core/apiTypes.ts'
import { checkNickname } from '../../_shared/core/nickname.ts'
import { db, must } from '../lib/db.ts'
import { logEvent } from '../lib/events.ts'
import { ApiError, json, readJson } from '../lib/http.ts'
import { requireSession } from '../lib/session.ts'

// 설정 화면: 지금 닉네임과, 닉네임이 없을 때 보이는 이름(가린 실명)
export async function profile(req: Request): Promise<Response> {
  const sess = await requireSession(req)
  const r = must(await db().from('recipients').select('nickname, name_masked').eq('id', sess.recipientId).single(), 'profile read') as
    { nickname: string | null; name_masked: string | null }
  const body: ProfileResponse = { nickname: r.nickname, defaultName: r.name_masked ?? '' }
  return json(200, body)
}

// 닉네임 저장. 비우면(null·빈 문자열) 지운다
export async function profileNickname(req: Request): Promise<Response> {
  const sess = await requireSession(req)
  const { nickname } = await readJson<{ nickname: unknown }>(req)
  let value: string | null = null
  if (nickname !== null && !(typeof nickname === 'string' && nickname.trim() === '')) {
    const problem = checkNickname(nickname)
    if (problem) throw new ApiError('VALIDATION', { field: 'nickname', reason: problem })
    value = (nickname as string).trim()
  }
  must(await db().from('recipients').update({ nickname: value }).eq('id', sess.recipientId), 'nickname save')
  await logEvent('nickname_set', { recipientId: sess.recipientId })
  return json(200, { ok: true })
}
