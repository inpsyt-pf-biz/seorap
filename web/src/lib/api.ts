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

// 응답이 이 시간 안에 오지 않으면 끊는다. 처리 중 잠금(서랍·전달 시트)이 영원히 안 풀리는 일을 막는다.
// 전달 만들기는 같은 요청 ID 로 다시 보내도 서버가 이전 결과를 돌려주므로 끊고 재시도해도 중복 전달은 없다.
const TIMEOUT_MS = 15_000

export async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response
  let text: string
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    res = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: ctrl.signal,
    })
    text = await res.text()
  } catch {
    // 네트워크 끊김·제한 시간 초과·본문 읽기 실패는 서버 오류와 같은 "잠시 문제" 로 다룬다
    throw new ApiError('UPSTREAM_FAILED', 0)
  } finally {
    clearTimeout(timer)
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
