// 화면이 DB를 부르는 곳은 이 파일 하나다. 나중에 서랍 어드민의 호출 방식이 달라져도 이 파일만 바꾼다.
import { CENTER_COLUMNS, type Center, type CenterInput } from '@counsel-core/centers.ts'
import { CounselError, toCounselError } from '@counsel-core/errors.ts'
import type { MyContext } from '../shell/session'
import { supabase } from '../shell/supabaseClient'

async function run<T>(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await request
  if (error) throw toCounselError(error)
  return data as T
}

export function getMyContext(): Promise<MyContext> {
  return run<MyContext>(supabase.rpc('my_context'))
}

// 본사 행은 센터 목록에 보이지 않는다
export function listCenters(): Promise<Center[]> {
  return run<Center[]>(supabase.from('centers').select(CENTER_COLUMNS).eq('is_headquarters', false).order('name'))
}

export async function getCenter(id: string): Promise<Center> {
  const c = await run<Center | null>(
    supabase.from('centers').select(CENTER_COLUMNS).eq('id', id).eq('is_headquarters', false).maybeSingle(),
  )
  if (!c) throw new CounselError('NOT_FOUND')
  return c
}

function centerParams(v: CenterInput) {
  return {
    p_name: v.name,
    p_status: v.status,
    p_regions: v.regions,
    p_counseling_types: v.counseling_types,
    p_delivery_modes: v.delivery_modes,
    p_phone: v.phone,
    p_address: v.address,
    p_contact_name: v.contact_name,
    p_contact_phone: v.contact_phone,
    p_contract_from: v.contract_from || null,
    p_contract_to: v.contract_to || null,
    p_memo: v.memo,
  }
}

export function createCenter(v: CenterInput): Promise<string> {
  return run<string>(supabase.rpc('rpc_create_center', centerParams(v)))
}

// 화면이 읽어 간 version 을 함께 보낸다. 그 사이 다른 사람이 고쳤으면 VERSION_CONFLICT 로 거부된다.
export function updateCenter(id: string, version: number, v: CenterInput): Promise<number> {
  return run<number>(supabase.rpc('rpc_update_center', { p_id: id, p_version: version, ...centerParams(v) }))
}
