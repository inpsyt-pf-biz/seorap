// 개발 전용 기능(가짜 문자, dev 우편함, 시드)은 허용 목록으로만 연다.
// SEORAP_ENV 가 비어 있거나 오타여도 닫힌 채로 있어야 한다.
export function isDevEnv(): boolean {
  return ['local', 'preview'].includes(Deno.env.get('SEORAP_ENV') ?? '')
}

// 가짜 발신함(/dev/outbox)을 열어도 되는지. 로컬은 그대로 열고, 미리보기는 함수 비밀값 SEORAP_DEV_OUTBOX_KEY 와
// 같은 X-Seorap-Dev-Key 머리글이 있을 때만 연다. 비밀값이 없거나 비었으면 닫는다(함수 주소는 Vercel 보호를 거치지 않는다).
export function devOutboxAllowed(env: string | undefined, secret: string | undefined, header: string | null | undefined): boolean {
  if (env === 'local') return true
  if (env !== 'preview') return false
  if (!secret || !header) return false
  return sameSecret(secret, header)
}

// 같은 길이일 때 글자마다 비교 시간을 같게 한다 (길이가 다르면 바로 거절)
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// 세션 쿠키의 Secure 를 끄는 설정(SEORAP_COOKIE_SECURE=false)은 로컬(http)에서만 받아 준다
export function cookieSecureDisabled(env: string | undefined, flag: string | undefined): boolean {
  return env === 'local' && flag === 'false'
}
