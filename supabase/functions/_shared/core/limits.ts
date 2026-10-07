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
