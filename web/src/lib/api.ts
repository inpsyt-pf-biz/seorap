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
  let res: Response
  let text: string
  try {
    res = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
    text = await res.text()
  } catch {
    // 네트워크 끊김·본문 읽기 실패는 서버 오류와 같은 "잠시 문제" 로 다룬다
    throw new ApiError('UPSTREAM_FAILED', 0)
  }
  let data: unknown = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiError('UPSTREAM_FAILED', res.status)
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: ErrorCode; extra?: Record<string, unknown> } } | null)?.error
    throw new ApiError(e?.code ?? 'UPSTREAM_FAILED', res.status, e?.extra ?? {})
  }
  return data as T
}
