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
  if (i.voucherToday >= i.settings.perVoucherDay) return { ok: false, reason: 'per_voucher_day', retryAt: nextKstMidnight(i.now) }
  if (i.lastSameNumberAt) {
    const until = new Date(i.lastSameNumberAt.getTime() + i.settings.sameNumberGapMin * 60_000)
    if (until > i.now) return { ok: false, reason: 'same_number_gap', retryAt: until }
  }
  const perBox = Math.max(i.settings.perBoxDayMin, i.unusedCount)
  if (i.boxToday >= perBox) return { ok: false, reason: 'per_box_day', retryAt: nextKstMidnight(i.now) }
  return { ok: true }
}
