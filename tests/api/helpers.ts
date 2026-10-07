import { createClient } from '@supabase/supabase-js'

export const BASE = Deno.env.get('API_BASE') ?? 'http://127.0.0.1:55321/functions/v1/api'
export const tokenFor = (s: string) => ('seed' + s).padEnd(32, '0')

export function adminDb() {
  return createClient(Deno.env.get('SEED_SUPABASE_URL')!, Deno.env.get('SEED_SERVICE_ROLE_KEY')!, {
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

export class Client {
  cookie = ''
  ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile'
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
    if (sc) this.cookie = sc.split(';')[0]
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : {} }
  }
}

export async function latestOtp(last4digits: string): Promise<string> {
  const { data } = await adminDb().from('dev_outbox').select('body').eq('kind', 'sms').eq('to_phone_last4', last4digits)
    .order('created_at', { ascending: false }).limit(1).single()
  return data!.body.match(/(\d{6})/)![1]
}

// OTP 재요청 간격(60초)·횟수 한도에 테스트가 걸리지 않게 설정을 바꿔 둔다.
// db:reset 직후 첫 파일만 함수의 설정 캐시(30초)가 비워질 때까지 기다린다.
export async function fastOtp() {
  const { data } = await adminDb().from('settings').select('value').eq('key', 'otp_resend_seconds').maybeSingle()
  if (data?.value === 0) return
  await adminDb().from('settings').upsert([{ key: 'otp_resend_seconds', value: 0 }, { key: 'otp_per_phone_hour', value: 100 }, { key: 'otp_per_phone_day', value: 100 }])
  await new Promise((r) => setTimeout(r, 31_000))
}

export async function login(scenario: string, last4digits: string): Promise<Client> {
  const c = new Client()
  const req = await c.call('otp/request', { token: tokenFor(scenario) })
  if (req.status !== 200) throw new Error(`otp request ${req.status} ${JSON.stringify(req.body)}`)
  const code = await latestOtp(last4digits)
  const v = await c.call('otp/verify', { token: tokenFor(scenario), code })
  if (v.status !== 200) throw new Error(`otp verify ${v.status} ${JSON.stringify(v.body)}`)
  return c
}
