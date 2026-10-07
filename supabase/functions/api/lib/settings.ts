import { db } from './db.ts'

export const DEFAULTS = {
  otp_ttl_seconds: 180,
  otp_max_attempts: 5,
  otp_resend_seconds: 60,
  otp_per_phone_hour: 5,
  otp_per_phone_day: 10,
  otp_lock_minutes: 15,
  session_mobile_idle_min: 60,
  session_mobile_max_hours: 24,
  session_desktop_idle_min: 30,
  forward_link_ttl_days: 180,
  forward_resend_per_voucher_day: 3,
  forward_same_number_gap_min: 10,
  forward_per_box_day_min: 20,
  box_window_months: 12,
  exam_status_enabled: false,
  notice_banner: null as string | null,
  mock_message_mode: 'success' as 'success' | 'fallback' | 'fail',
}
export type Settings = typeof DEFAULTS

let cached: { at: number; value: Settings } | null = null
export async function getSettings(): Promise<Settings> {
  if (cached && Date.now() - cached.at < 30_000) return cached.value
  const { data } = await db().from('settings').select('key, value')
  const value = { ...DEFAULTS } as Record<string, unknown>
  for (const row of data ?? []) if (row.key in DEFAULTS) value[row.key] = row.value
  cached = { at: Date.now(), value: value as Settings }
  return cached.value
}
