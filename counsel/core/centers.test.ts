import { assertEquals } from '@std/assert'
import {
  CATEGORIES, CENTER_STATUSES, DELIVERY_MODES, EMPTY_CENTER_INPUT, REGIONS,
  contractLabel, filterCenters, locationLabel, modesLabel, ordered, regionsLabel, validateCenterInput,
} from './centers.ts'
import { toCounselError } from './errors.ts'

// 허용값 목록이 DB CHECK 와 TS 두 곳에 있다. 한쪽만 고치면 이 시험이 막는다. 마이그레이션은 순서대로 이어 읽는다.
const dir = new URL('../supabase/migrations/', import.meta.url)
const files = [...Deno.readDirSync(dir)].map((e) => e.name).filter((n) => n.endsWith('.sql')).sort()
const sql = files.map((f) => Deno.readTextFileSync(new URL(f, dir))).join('\n')
function checkList(column: string): string[] {
  const m = new RegExp(`${column} [^\\n]*check \\(${column} (?:in \\(|<@ array\\[)([^\\]\\)]*)`, 's').exec(sql)
  if (!m) throw new Error(`CHECK for ${column} not found`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

Deno.test('허용값 목록이 DB CHECK 와 같다', () => {
  assertEquals(checkList('regions'), [...REGIONS])
  assertEquals(checkList('location_sido'), [...REGIONS])
  assertEquals(checkList('status'), [...CENTER_STATUSES])
  assertEquals(checkList('categories'), [...CATEGORIES])
  assertEquals(checkList('delivery_modes'), [...DELIVERY_MODES])
})

Deno.test('지역 칸: 시·도와 구·시를 잇는다', () => {
  assertEquals(locationLabel('서울', '강남'), '서울 강남')
  assertEquals(locationLabel('세종', null), '세종')
  assertEquals(locationLabel(null, null), '-')
})

Deno.test('상담 가능 지역 표시: 17개 전부면 전지역, 없으면 -, 그 밖에는 시·도 순서', () => {
  assertEquals(regionsLabel([...REGIONS]), '전지역')
  assertEquals(regionsLabel([]), '-')
  assertEquals(regionsLabel(['경기', '서울']), '서울, 경기')
})

Deno.test('카테고리·방식은 정의 순서로 정렬한다', () => {
  assertEquals(ordered(['family', 'development'], CATEGORIES), ['development', 'family'])
  assertEquals(modesLabel(['online', 'offline']), '대면 · 비대면')
})

Deno.test('계약 기간 표시', () => {
  assertEquals(contractLabel(null, null), '-')
  assertEquals(contractLabel('2026-01-01', '2026-12-31'), '2026-01-01 ~ 2026-12-31')
  assertEquals(contractLabel('2026-01-01', null), '2026-01-01 ~')
})

Deno.test('목록 거르기: 이름은 대소문자 무시 부분 일치, 지역(소재지 시·도)·상태는 정확히', () => {
  const rows = [
    { name: '마음숲 상담센터', location_sido: '서울', status: 'active' as const },
    { name: 'Onda 온라인상담', location_sido: '서울', status: 'paused' as const },
    { name: '바다빛 가족상담센터', location_sido: '부산', status: 'active' as const },
    { name: '지역 미정 센터', location_sido: null, status: 'onboarding' as const },
  ]
  assertEquals(filterCenters(rows, { q: '', sido: '', status: '' }).length, 4)
  assertEquals(filterCenters(rows, { q: 'onda', sido: '', status: '' }).map((r) => r.name), ['Onda 온라인상담'])
  assertEquals(filterCenters(rows, { q: '', sido: '서울', status: 'active' }).map((r) => r.name), ['마음숲 상담센터'])
})

Deno.test('입력 검사', () => {
  assertEquals(validateCenterInput(EMPTY_CENTER_INPUT), { name: 'form.error.nameRequired' })
  const ok = { ...EMPTY_CENTER_INPUT, name: '마음숲', location_sido: '서울', location_sigungu: '강남', phone: '02-555-0101', contract_from: '2026-01-01', contract_to: '2026-12-31' }
  assertEquals(validateCenterInput(ok), {})
  assertEquals(validateCenterInput({ ...ok, phone: '02)555' }), { phone: 'form.error.phone' })
  assertEquals(validateCenterInput({ ...ok, contract_to: '2025-12-31' }), { contract_to: 'form.error.contractPeriod' })
  assertEquals(validateCenterInput({ ...ok, name: 'x'.repeat(61) }), { name: 'form.error.nameLength' })
  assertEquals(validateCenterInput({ ...ok, location_sido: '' }), { location_sido: 'form.error.sidoRequired' })
})

Deno.test('DB 오류 문구에서 코드를 꺼낸다. 모르는 오류는 generic', () => {
  assertEquals(toCounselError({ message: 'COUNSEL:VERSION_CONFLICT', details: '3' }).code, 'VERSION_CONFLICT')
  assertEquals(toCounselError({ message: 'COUNSEL:VERSION_CONFLICT', details: '3' }).detail, '3')
  assertEquals(toCounselError({ message: 'COUNSEL:WHATEVER' }).code, 'generic')
  assertEquals(toCounselError(new Error('network')).code, 'generic')
})
