// 로컬 스택 접속값을 읽는다. 로컬 주소가 아니면 멈춘다(시드·시험이 다른 DB에 붙지 않게).
export type LocalStatus = { apiUrl: string; dbUrl: string; publishableKey: string; serviceRoleKey: string }

const COUNSEL_DIR = new URL('../', import.meta.url)

export async function localStatus(): Promise<LocalStatus> {
  const out = await new Deno.Command('supabase', { args: ['status', '-o', 'json'], cwd: COUNSEL_DIR, stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) throw new Error('supabase status 실패. counsel 폴더에서 deno task db:start 를 먼저 실행하세요')
  const text = new TextDecoder().decode(out.stdout)
  const s = JSON.parse(text.slice(text.indexOf('{'))) as Record<string, string>
  const status = { apiUrl: s.API_URL, dbUrl: s.DB_URL, publishableKey: s.PUBLISHABLE_KEY, serviceRoleKey: s.SERVICE_ROLE_KEY }
  if (status.apiUrl !== 'http://127.0.0.1:56321' || !/@127\.0\.0\.1:56322\//.test(status.dbUrl)) {
    throw new Error(`로컬 상담 툴 스택이 아니다: ${status.apiUrl}`)
  }
  return status
}

export const ENV_FILE = new URL('.env.local', COUNSEL_DIR)
export const WEB_ENV_FILE = new URL('web/.env.local', COUNSEL_DIR)

export function readEnvFile(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (m) env[m[1]] = m[2]
  }
  return env
}

// .env.local 은 첫 시드 때 만든다. 있으면 COUNSEL_ENV=local 일 때만 진행한다.
export async function localEnv(): Promise<{ password: string }> {
  let text: string | null = null
  try { text = await Deno.readTextFile(ENV_FILE) } catch { /* 첫 실행 */ }
  if (text === null) {
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    const password = 'Local-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    await Deno.writeTextFile(ENV_FILE, `COUNSEL_ENV=local\nCOUNSEL_SEED_PASSWORD=${password}\n`)
    return { password }
  }
  const env = readEnvFile(text)
  if (env.COUNSEL_ENV !== 'local') throw new Error('counsel/.env.local 의 COUNSEL_ENV 가 local 이 아니다')
  if (!env.COUNSEL_SEED_PASSWORD) throw new Error('counsel/.env.local 에 COUNSEL_SEED_PASSWORD 가 없다')
  return { password: env.COUNSEL_SEED_PASSWORD }
}

export const SEED_ACCOUNTS = [
  { key: 'admin', email: 'hq.admin@counsel.test', name: '김관리', role: 'hq_admin', label: '관리자 · 김관리' },
  { key: 'manager', email: 'hq.manager@counsel.test', name: '이담당', role: 'hq_manager', label: '담당자 · 이담당' },
  { key: 'nobody', email: 'nobody@counsel.test', name: '최소속', role: null, label: '소속 없음 · 최소속' },
] as const
