import { devOutbox } from './handlers/dev.ts'
import { entry } from './handlers/entry.ts'
import { logout } from './handlers/logout.ts'
import { otpRequest, otpVerify } from './handlers/otp.ts'
import { ApiError, json } from './lib/http.ts'

type Handler = (req: Request) => Promise<Response>
export const routes: Record<string, Handler> = {
  'POST entry': entry,
  'POST otp/request': otpRequest,
  'POST otp/verify': otpVerify,
  'POST logout': logout,
  'GET dev/outbox': devOutbox,
}

export async function route(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/^.*?\/api\/?/, '').replace(/\/$/, '')
  const handler = routes[`${req.method} ${path}`]
  try {
    if (!handler) throw new ApiError('VALIDATION', { reason: 'unknown_route' })
    return await handler(req)
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { error: { code: e.code, extra: e.extra } })
    console.error('api error', path, e instanceof Error ? e.message : 'unknown') // 개인정보·토큰을 남기지 않는다
    return json(502, { error: { code: 'UPSTREAM_FAILED' } })
  }
}
