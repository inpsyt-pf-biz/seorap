import { db } from './db.ts'

export const DEFAULTS = {
  otp_ttl_seconds: 180,
  otp_max_attempts: 5,
  otp_resend_seconds: 60,
  otp_per_phone_hour: 5,
  otp_per_phone_day: 10,
  otp_lock_minutes: 15,
  pin_max_attempts: 5,
  pin_set_window_min: 10,
  // 상담 신청서(B2): 신청서는 인증한 지 15분 안에 열고 45분 안에 낸다(민감정보라 공용 기기 노출을 줄인다)
  counsel_open_max_min: 15,
  counsel_submit_max_min: 45,
  // 'mock' 이면 가짜 상담 원장(테스트). 'real' 은 COUNSEL_URL 의 상담 어드민 DB
  counsel_mode: 'real' as 'real' | 'mock',
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
  // 받는 분 화면·도움말의 문의처 한 줄 (운영 결정 전 [자리])
  contact_line: '[자리] 문의: 인싸이트 스토어 톡톡 (평일 10~17시)',
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
