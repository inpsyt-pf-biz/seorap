// DB 함수는 'COUNSEL:<코드>' 문구로 오류를 던진다. 화면은 코드만 보고 문장은 copy 에서 만든다.
import { t, type CopyKey } from './copy.ko.ts'

export const ERROR_CODES = ['FORBIDDEN', 'NOT_FOUND', 'VERSION_CONFLICT', 'DUPLICATE_NAME', 'INVALID_INPUT'] as const
export type ErrorCode = (typeof ERROR_CODES)[number] | 'generic'

export class CounselError extends Error {
  readonly code: ErrorCode
  readonly detail: string | null
  constructor(code: ErrorCode, detail: string | null = null) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

export function toCounselError(e: unknown): CounselError {
  if (e instanceof CounselError) return e
  const err = e as { message?: unknown; details?: unknown } | null
  const m = typeof err?.message === 'string' ? /^COUNSEL:([A-Z_]+)$/.exec(err.message) : null
  const code = m && (ERROR_CODES as readonly string[]).includes(m[1]) ? (m[1] as ErrorCode) : 'generic'
  const detail = typeof err?.details === 'string' ? err.details : null
  return new CounselError(code, detail)
}

export function errorText(e: CounselError): string {
  return t(`error.${e.code}` as CopyKey)
}
