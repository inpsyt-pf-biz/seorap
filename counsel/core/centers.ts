// 협력센터 코드와 표시 규칙. 허용값 목록은 DB 마이그레이션의 CHECK 와 같아야 하고, centers.test.ts 가 두 곳을 대조한다.
import { t, type CopyKey } from './copy.ko.ts'

// 시·도 17개. 출처: teacherson-admin/lib/regions.ts (REGION_OPTIONS). 소재지와 상담 가능 지역이 같은 목록을 쓴다.
export const REGIONS = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
] as const
export type Region = (typeof REGIONS)[number]

export const CENTER_STATUSES = ['onboarding', 'active', 'paused', 'terminated'] as const
export type CenterStatus = (typeof CENTER_STATUSES)[number]

export const CATEGORIES = ['development', 'emotion', 'youth', 'learning', 'family'] as const
export type Category = (typeof CATEGORIES)[number]

export const DELIVERY_MODES = ['offline', 'online'] as const
export type DeliveryMode = (typeof DELIVERY_MODES)[number]

export type Center = {
  id: string
  name: string
  status: CenterStatus
  location_sido: string | null
  location_sigungu: string | null
  categories: string[]
  regions: string[]
  delivery_modes: string[]
  phone: string | null
  address: string | null
  contact_name: string | null
  contact_phone: string | null
  contract_from: string | null
  contract_to: string | null
  memo: string | null
  version: number
  created_at: string
  updated_at: string
  // 이 센터에 배정된 예약 수. 예약 표가 생기는 단계(MVP-1)에서 목록 조회가 채운다. 그 전에는 0으로 본다.
  assigned_count?: number
}

export const CENTER_COLUMNS =
  'id, name, status, location_sido, location_sigungu, categories, regions, delivery_modes, phone, address, contact_name, contact_phone, contract_from, contract_to, memo, version, created_at, updated_at'

export function statusLabel(s: string): string {
  return (CENTER_STATUSES as readonly string[]).includes(s) ? t(`center.status.${s}` as CopyKey) : s
}

export function categoryLabel(v: string): string {
  return (CATEGORIES as readonly string[]).includes(v) ? t(`center.category.${v}` as CopyKey) : v
}

export function modeLabel(v: string): string {
  return (DELIVERY_MODES as readonly string[]).includes(v) ? t(`center.mode.${v}` as CopyKey) : v
}

// 정의 순서(시·도는 위 목록 순서)로 정렬한다
export function ordered(values: string[], order: readonly string[]): string[] {
  return [...values].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

// 목록의 "지역" 칸: "서울 강남"처럼 소재지 시·도와 구·시를 잇는다
export function locationLabel(sido: string | null, sigungu: string | null): string {
  const parts = [sido, sigungu].filter((x): x is string => !!x)
  return parts.length ? parts.join(' ') : t('center.empty')
}

export function regionsLabel(regions: string[]): string {
  if (regions.length === 0) return t('center.empty')
  if (REGIONS.every((r) => regions.includes(r))) return t('center.regions.all')
  return ordered(regions, REGIONS).join(', ')
}

export function modesLabel(modes: string[]): string {
  return modes.length === 0 ? t('center.empty') : ordered(modes, DELIVERY_MODES).map(modeLabel).join(' · ')
}

export function contractLabel(from: string | null, to: string | null): string {
  if (!from && !to) return t('center.empty')
  return t('center.contract', { from: from ?? '', to: to ?? '' }).trim()
}

export type CenterFilter = { q: string; sido: string; status: string }

// 목록 거르기. 빈 값은 "전체"다. 지역은 소재지 시·도로 거른다.
export function filterCenters<T extends Pick<Center, 'name' | 'location_sido' | 'status'>>(rows: T[], f: CenterFilter): T[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter((r) =>
    (!q || r.name.toLowerCase().includes(q))
    && (!f.sido || r.location_sido === f.sido)
    && (!f.status || r.status === f.status),
  )
}

export type CenterInput = {
  name: string
  status: CenterStatus
  location_sido: string
  location_sigungu: string
  categories: string[]
  regions: string[]
  delivery_modes: string[]
  phone: string
  address: string
  contact_name: string
  contact_phone: string
  contract_from: string
  contract_to: string
  memo: string
}

export const EMPTY_CENTER_INPUT: CenterInput = {
  name: '', status: 'onboarding', location_sido: '', location_sigungu: '', categories: [], regions: [], delivery_modes: [],
  phone: '', address: '', contact_name: '', contact_phone: '', contract_from: '', contract_to: '', memo: '',
}

export function toInput(c: Center): CenterInput {
  return {
    name: c.name, status: c.status, location_sido: c.location_sido ?? '', location_sigungu: c.location_sigungu ?? '',
    categories: c.categories, regions: c.regions, delivery_modes: c.delivery_modes,
    phone: c.phone ?? '', address: c.address ?? '', contact_name: c.contact_name ?? '', contact_phone: c.contact_phone ?? '',
    contract_from: c.contract_from ?? '', contract_to: c.contract_to ?? '', memo: c.memo ?? '',
  }
}

const PHONE = /^[0-9-]{8,20}$/

export type CenterInputErrors = Partial<Record<keyof CenterInput, CopyKey>>

// 화면에서 먼저 막는 검사. DB CHECK 와 같은 기준이며, 최종 판정은 DB가 한다.
export function validateCenterInput(v: CenterInput): CenterInputErrors {
  const e: CenterInputErrors = {}
  const name = v.name.trim()
  if (!name) e.name = 'form.error.nameRequired'
  else if (name.length > 60) e.name = 'form.error.nameLength'
  if (v.location_sigungu.trim() && !v.location_sido) e.location_sido = 'form.error.sidoRequired'
  if (v.location_sigungu.trim().length > 20) e.location_sigungu = 'form.error.sigunguLength'
  if (v.phone.trim() && !PHONE.test(v.phone.trim())) e.phone = 'form.error.phone'
  if (v.contact_phone.trim() && !PHONE.test(v.contact_phone.trim())) e.contact_phone = 'form.error.phone'
  if (v.address.trim().length > 200) e.address = 'form.error.addressLength'
  if (v.contact_name.trim().length > 30) e.contact_name = 'form.error.contactNameLength'
  if (v.memo.trim().length > 500) e.memo = 'form.error.memoLength'
  if (v.contract_from && v.contract_to && v.contract_from > v.contract_to) e.contract_to = 'form.error.contractPeriod'
  return e
}
