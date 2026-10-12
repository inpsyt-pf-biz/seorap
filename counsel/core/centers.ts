// 협력센터 코드와 표시 규칙. 허용값 목록은 DB 마이그레이션의 CHECK 와 같아야 하고, centers.test.ts 가 두 곳을 대조한다.
import { t, type CopyKey } from './copy.ko.ts'
import { isInKorea } from './geo.ts'
import { REGIONS } from './regions.ts'

export { REGIONS, type Region } from './regions.ts'

export const CENTER_STATUSES = ['onboarding', 'active', 'paused', 'terminated'] as const
export type CenterStatus = (typeof CENTER_STATUSES)[number]

// 대상: 누구를 상담하나 (기획 문서 Step 1 필터의 "상담 유형")
export const TARGET_GROUPS = ['infant', 'child_youth', 'adult'] as const
export type TargetGroup = (typeof TARGET_GROUPS)[number]

// 전문 분야: 무엇을 다루나 (기획 문서 Step 2의 "상담 전문 분야")
export const SPECIALTIES = ['development', 'emotion', 'youth', 'learning', 'family'] as const
export type Specialty = (typeof SPECIALTIES)[number]

export const DELIVERY_MODES = ['offline', 'online'] as const
export type DeliveryMode = (typeof DELIVERY_MODES)[number]

export type Center = {
  id: string
  name: string
  status: CenterStatus
  location_sido: string | null
  location_sigungu: string | null
  latitude: number | null
  longitude: number | null
  target_groups: string[]
  specialties: string[]
  regions: string[]
  delivery_modes: string[]
  phone: string | null
  address: string | null
  operating_hours: string | null
  contact_name: string | null
  contact_phone: string | null
  contract_from: string | null
  contract_to: string | null
  memo: string | null
  version: number
  created_at: string
  updated_at: string
  // 배정·완료 건수. 구매 건과 상담 장부가 생기는 단계(MVP-1)에서 목록 조회가 채운다. 그 전에는 0으로 본다.
  assigned_count?: number
  completed_count?: number
}

export const CENTER_COLUMNS =
  'id, name, status, location_sido, location_sigungu, latitude, longitude, target_groups, specialties, regions, delivery_modes, '
  + 'phone, address, operating_hours, contact_name, contact_phone, contract_from, contract_to, memo, version, created_at, updated_at'

export function statusLabel(s: string): string {
  return (CENTER_STATUSES as readonly string[]).includes(s) ? t(`center.status.${s}` as CopyKey) : s
}

export function targetLabel(v: string): string {
  return (TARGET_GROUPS as readonly string[]).includes(v) ? t(`center.target.${v}` as CopyKey) : v
}

export function specialtyLabel(v: string): string {
  return (SPECIALTIES as readonly string[]).includes(v) ? t(`center.specialty.${v}` as CopyKey) : v
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

export function targetsLabel(targets: string[]): string {
  return targets.length === 0 ? t('center.empty') : ordered(targets, TARGET_GROUPS).map(targetLabel).join(', ')
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

export type CenterFilter = { q: string; sido: string; target: string; status: string }

export const EMPTY_FILTER: CenterFilter = { q: '', sido: '', target: '', status: '' }

// 목록 거르기. 빈 값은 "전체"다. 지역은 소재지 시·도로, 대상은 하나라도 겹치면 맞는 것으로 본다.
export function filterCenters<T extends Pick<Center, 'name' | 'location_sido' | 'status' | 'target_groups'>>(rows: T[], f: CenterFilter): T[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter((r) =>
    (!q || r.name.toLowerCase().includes(q))
    && (!f.sido || r.location_sido === f.sido)
    && (!f.target || r.target_groups.includes(f.target))
    && (!f.status || r.status === f.status),
  )
}

export type CenterInput = {
  name: string
  status: CenterStatus
  location_sido: string
  location_sigungu: string
  // 지도에서 찍은 위치. 둘 다 있거나 둘 다 없다.
  latitude: number | null
  longitude: number | null
  target_groups: string[]
  specialties: string[]
  regions: string[]
  delivery_modes: string[]
  phone: string
  address: string
  operating_hours: string
  contact_name: string
  contact_phone: string
  contract_from: string
  contract_to: string
  memo: string
}

export const EMPTY_CENTER_INPUT: CenterInput = {
  name: '', status: 'onboarding', location_sido: '', location_sigungu: '', latitude: null, longitude: null,
  target_groups: [], specialties: [], regions: [], delivery_modes: [],
  phone: '', address: '', operating_hours: '', contact_name: '', contact_phone: '', contract_from: '', contract_to: '', memo: '',
}

export function toInput(c: Center): CenterInput {
  return {
    name: c.name, status: c.status, location_sido: c.location_sido ?? '', location_sigungu: c.location_sigungu ?? '',
    latitude: c.latitude, longitude: c.longitude,
    target_groups: c.target_groups, specialties: c.specialties, regions: c.regions, delivery_modes: c.delivery_modes,
    phone: c.phone ?? '', address: c.address ?? '', operating_hours: c.operating_hours ?? '',
    contact_name: c.contact_name ?? '', contact_phone: c.contact_phone ?? '',
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
  if (v.operating_hours.trim().length > 100) e.operating_hours = 'form.error.operatingHoursLength'
  if (v.contact_name.trim().length > 30) e.contact_name = 'form.error.contactNameLength'
  if (v.memo.trim().length > 500) e.memo = 'form.error.memoLength'
  if (v.contract_from && v.contract_to && v.contract_from > v.contract_to) e.contract_to = 'form.error.contractPeriod'
  if ((v.latitude === null) !== (v.longitude === null)
    || (v.latitude !== null && v.longitude !== null && !isInKorea({ lat: v.latitude, lng: v.longitude }))) {
    e.latitude = 'form.error.position'
  }
  return e
}
