import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null
export function db(): SupabaseClient {
  if (!client) {
    // 새 방식 비밀키(sb_secret_…)를 먼저 쓴다. legacy service_role 키는 프로젝트에서 끄기 전까지의 대비값이다
    const key = Deno.env.get('SEORAP_DB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!key) throw new Error('missing db key')
    // 스키마 'app'은 제네릭에 드러나지 않으므로(Database=any) 기본 SupabaseClient 타입으로 맞춘다
    client = createClient(Deno.env.get('SUPABASE_URL')!, key, {
      db: { schema: 'app' },
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as SupabaseClient
  }
  return client
}

// supabase-js 오류를 그대로 던지지 않고, 개인정보 없이 짧게 남긴다
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data as T
}

// 개수 조회(head + count). 오류를 0건으로 바꿔 한도를 통과시키지 않도록 같은 방식으로 던진다
export function mustCount(res: { count: number | null; error: { message: string } | null }, what: string): number {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.count ?? 0
}
