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
  try {
    return (await req.json()) as T
  } catch {
    throw new ApiError('VALIDATION', { field: 'body' })
  }
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
