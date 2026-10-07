import type { ErrorCode } from '@core/apiTypes.ts'

export class ApiError extends Error {
  code: ErrorCode
  status: number
  extra: Record<string, unknown>
  constructor(code: ErrorCode, status: number, extra: Record<string, unknown> = {}) {
    super(code)
    this.code = code
    this.status = status
    this.extra = extra
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const text = await res.text()
  let data: unknown = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiError('UPSTREAM_FAILED', res.status)
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: ErrorCode; extra?: Record<string, unknown> } }).error
    throw new ApiError(e?.code ?? 'UPSTREAM_FAILED', res.status, e?.extra ?? {})
  }
  return data as T
}
