import { nextKstMidnight } from './time.ts'

export type ForwardLimitInput = {
  now: Date
  voucherToday: number
  boxToday: number
  lastSameNumberAt: Date | null
  unusedCount: number
  settings: { perVoucherDay: number; sameNumberGapMin: number; perBoxDayMin: number }
}
export type LimitResult = { ok: true } | { ok: false; reason: 'per_voucher_day' | 'same_number_gap' | 'per_box_day'; retryAt: Date }

export function checkForwardLimits(i: ForwardLimitInput): LimitResult {
  type Failure = { ok: false; reason: 'per_voucher_day' | 'same_number_gap' | 'per_box_day'; retryAt: Date }
  const failures: Failure[] = []

  // Check per_voucher_day limit
  if (i.voucherToday >= i.settings.perVoucherDay) {
    failures.push({ ok: false, reason: 'per_voucher_day', retryAt: nextKstMidnight(i.now) })
  }

  // Check same_number_gap limit
  if (i.lastSameNumberAt) {
    const until = new Date(i.lastSameNumberAt.getTime() + i.settings.sameNumberGapMin * 60_000)
    if (until > i.now) {
      failures.push({ ok: false, reason: 'same_number_gap', retryAt: until })
    }
  }

  // Check per_box_day limit
  const perBox = Math.max(i.settings.perBoxDayMin, i.unusedCount)
  if (i.boxToday >= perBox) {
    failures.push({ ok: false, reason: 'per_box_day', retryAt: nextKstMidnight(i.now) })
  }

  // If no failures, return ok
  if (failures.length === 0) return { ok: true }

  // Return failure with latest retryAt (on ties, earlier-checked wins)
  return failures.reduce((max, f) => f.retryAt.getTime() > max.retryAt.getTime() ? f : max)
}

// OTP 요청 한도(번호당 1시간·24시간)에 걸렸으면 다시 받을 수 있는 시각, 아니면 null.
// createdAt: 그 번호로 최근 24시간 안에 만든 OTP 요청 시각들. 걸린 창마다 그 창에서 가장 오래된 요청이 창을 벗어나는 때
// (한도보다 많이 쌓였으면 한도 아래로 내려가게 하는 요청)를 구하고, 둘 다 걸렸으면 더 늦은 쪽을 준다.
export function otpRetryAt(i: { now: Date; createdAt: Date[]; perHour: number; perDay: number }): Date | null {
  const HOUR = 3_600_000
  const DAY = 86_400_000
  const times = i.createdAt.map((d) => d.getTime()).sort((a, b) => a - b)
  const at = (windowMs: number, cap: number): number | null => {
    const inWindow = times.filter((x) => x >= i.now.getTime() - windowMs)
    if (inWindow.length < cap) return null
    return inWindow[Math.max(0, inWindow.length - cap)] + windowMs
  }
  const candidates = [at(HOUR, i.perHour), at(DAY, i.perDay)].filter((x): x is number => x !== null)
  return candidates.length ? new Date(Math.max(...candidates)) : null
}
