import type { ErrorCode } from '../../_shared/core/apiTypes.ts'

const STATUS: Record<ErrorCode, number> = {
  OTP_WRONG: 400, OTP_EXPIRED: 400, OTP_LOCKED: 423, RATE_LIMITED: 429, LINK_INVALID: 404, LINK_REVOKED: 410,
  SESSION_EXPIRED: 401, REAUTH_REQUIRED: 401, FORBIDDEN: 403, NOT_OWNER: 403, CONFLICT: 409, LIMIT_EXCEEDED: 429,
  VALIDATION: 422, UPSTREAM_FAILED: 502, MAINTENANCE: 503,
}

export class ApiError extends Error {
  code: ErrorCode
  status: number
  extra: Record<string, unknown>
  constructor(code: ErrorCode, extra: Record<string, unknown> = {}) {
    super(code)
    this.code = code
    this.status = STATUS[code]
    this.extra = extra
  }
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}

export async function readJson<T>(req: Request): Promise<T> {
  // JSON 으로 보낸 요청만 받는다. 다른 사이트의 일반 form(text/plain 등) POST 가 JSON 으로 읽히지 않게 한다.
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new ApiError('VALIDATION', { field: 'contentType' })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ApiError('VALIDATION', { field: 'body' })
  }
  // 본문은 일반 객체여야 한다 (null·배열·문자열·숫자는 구조 분해에서 500 이 되므로 여기서 막는다)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new ApiError('VALIDATION', { field: 'body' })
  return body as T
}

export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') ?? ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

export function isMobile(req: Request): boolean {
  return /Mobi|Android|iPhone|iPad/i.test(req.headers.get('user-agent') ?? '')
}
