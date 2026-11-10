// 이름 + 휴대전화번호 + 비밀번호 로그인 (11-10 건우님 결정, 01-plan §0).
// 셋을 한 번에 받아야 "이 이름·번호가 구매자인가"를 하나씩 떠보는 길이 막힌다. 어느 것이 틀려도 답은 하나(LOGIN_FAILED)다.
import { normalizePhone } from './phone.ts'

// 같은 접속 주소에서 이 시간 안에 이만큼 틀리면 잠시 막는다 (번호를 바꿔 가며 비밀번호를 찍는 시도)
export const LOGIN_IP_MAX = 30
export const LOGIN_IP_WINDOW_MIN = 15
const NAME_MAX = 50

// 이름은 띄어쓰기·대소문자·자모 조합 방식만 다르면 같은 이름으로 본다
const nameKey = (s: string) => s.normalize('NFC').replace(/\s+/g, '').toLowerCase()
export function sameName(stored: string, typed: string): boolean {
  const a = nameKey(stored)
  return a !== '' && a === nameKey(typed)
}

export type LoginInput = { name: string; phone: string; pin: string }
// 모양이 틀린 입력은 화면이 먼저 막는다. 서버는 모양만 보고, 맞고 틀림은 말하지 않는다
export function readLoginInput(body: { name?: unknown; phone?: unknown; pin?: unknown }): LoginInput | null {
  const { name, phone, pin } = body
  if (typeof name !== 'string' || typeof phone !== 'string' || typeof pin !== 'string') return null
  const n = name.trim()
  const p = normalizePhone(phone)
  if (!n || n.length > NAME_MAX || !p || !/^\d{6}$/.test(pin)) return null
  return { name: n, phone: p, pin }
}

// 접속 주소: 프록시(Vercel·Supabase)가 붙인 x-forwarded-for 의 첫 주소가 접속한 기기다
export function clientIp(h: Headers): string | null {
  const first = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  return first || h.get('x-real-ip')?.trim() || null
}
