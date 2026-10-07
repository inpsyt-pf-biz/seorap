import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null
export function db(): SupabaseClient {
  if (!client) {
    // 스키마 'app'은 제네릭에 드러나지 않으므로(Database=any) 기본 SupabaseClient 타입으로 맞춘다
    client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
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
