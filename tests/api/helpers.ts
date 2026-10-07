import { createClient } from '@supabase/supabase-js'

export const BASE = Deno.env.get('API_BASE') ?? 'http://127.0.0.1:55321/functions/v1/api'
export const tokenFor = (s: string) => ('seed' + s).padEnd(32, '0')

export function adminDb() {
  return createClient(Deno.env.get('SEED_SUPABASE_URL')!, Deno.env.get('SEED_SECRET_KEY')!, {
    db: { schema: 'app' }, auth: { persistSession: false, autoRefreshToken: false },
  })
}

// 받는 분 링크 토큰의 저장용 해시(함수와 같은 키). 키 파일에서 HMAC 키만 읽고 값은 출력하지 않는다.
export async function forwardTokenHash(token: string): Promise<string> {
  if (!Deno.env.get('SEORAP_HMAC_KEY')) {
    const file = Deno.env.get('SEED_KEYS_FILE') ?? 'supabase/functions/.env'
    for (const line of (await Deno.readTextFile(file)).split(/\r?\n/)) {
      const m = line.match(/^SEORAP_HMAC_KEY=(.*)$/)
      if (m) Deno.env.set('SEORAP_HMAC_KEY', m[1])
    }
  }
  const { hmac } = await import('../../supabase/functions/_shared/crypto.ts')
  return hmac(`forward:${token}`)
}

export const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile'
export const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

export class Client {
  cookie = ''
  // 마지막으로 받은 Set-Cookie 원문 (쿠키 속성 확인용)
  setCookie = ''
  ua = MOBILE_UA
  async call(path: string, body?: unknown): Promise<{ status: number; body: any }> {
    const res = await fetch(`${BASE}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'User-Agent': this.ua,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const sc = res.headers.get('set-cookie')
    if (sc) {
      this.setCookie = sc
      this.cookie = sc.split(';')[0]
    }
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : {} }
  }
}

export async function latestOtp(last4digits: string): Promise<string> {
  const { data } = await adminDb().from('dev_outbox').select('body').eq('kind', 'sms').eq('to_phone_last4', last4digits)
    .order('created_at', { ascending: false }).limit(1).single()
  return data!.body.match(/(\d{6})/)![1]
}

// 테스트용 설정. OTP 재요청 간격(60초)·횟수 한도에 테스트가 걸리지 않게 하고,
// 서랍 기간(기본 12개월)을 길게 잡아 시드의 지난 구매(S3, 2026-09-30)가 날짜가 지나도 서랍에서 빠지지 않게 한다.
const TEST_SETTINGS = { otp_resend_seconds: 0, otp_per_phone_hour: 100, otp_per_phone_day: 100, box_window_months: 120 }

// db:reset 직후 첫 파일만 함수의 설정 캐시(30초)가 비워질 때까지 기다린다.
export async function fastOtp() {
  const { data } = await adminDb().from('settings').select('key, value').in('key', Object.keys(TEST_SETTINGS))
  const now = new Map((data ?? []).map((r) => [r.key, r.value]))
  if (Object.entries(TEST_SETTINGS).every(([k, v]) => now.get(k) === v)) return
  await adminDb().from('settings').upsert(Object.entries(TEST_SETTINGS).map(([key, value]) => ({ key, value })))
  await new Promise((r) => setTimeout(r, 31_000))
}

export async function login(scenario: string, last4digits: string, ua = MOBILE_UA): Promise<Client> {
  const c = new Client()
  c.ua = ua
  const req = await c.call('otp/request', { token: tokenFor(scenario) })
  if (req.status !== 200) throw new Error(`otp request ${req.status} ${JSON.stringify(req.body)}`)
  const code = await latestOtp(last4digits)
  const v = await c.call('otp/verify', { token: tokenFor(scenario), code })
  if (v.status !== 200) throw new Error(`otp verify ${v.status} ${JSON.stringify(v.body)}`)
  return c
}
