import { type CopyKey, t } from '@core/copy.ko.ts'
import { formatKstDateTime } from '@core/time.ts'
import { ApiError } from './api'

// 한도 429 는 이유(reason)별 문장으로 안내한다. 모르는 이유는 일반 문장으로 보낸다.
const LIMIT_KEY = {
  per_voucher_day: 'limit.per_voucher_day', same_number_gap: 'limit.same_number_gap', per_box_day: 'limit.per_box_day',
} as const satisfies Record<string, CopyKey>

// 서버 오류를 사용자에게 보일 한 문장으로 바꾼다 (서랍 화면·전달 시트 공용)
export function failText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.extra.reason === 'code_exposed') return t('forward.exposed')
    const reason = String(e.extra.reason)
    if (e.code === 'LIMIT_EXCEEDED' && Object.hasOwn(LIMIT_KEY, reason) && typeof e.extra.retryAt === 'string') {
      return t(LIMIT_KEY[reason as keyof typeof LIMIT_KEY], { time: formatKstDateTime(e.extra.retryAt) })
    }
  }
  return t('error.generic')
}
