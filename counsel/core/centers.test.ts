import { assertEquals } from '@std/assert'
import {
  CENTER_STATUSES, COUNSELING_TYPES, DELIVERY_MODES, EMPTY_CENTER_INPUT, REGIONS,
  contractLabel, filterCenters, modesLabel, regionsLabel, typesLabel, validateCenterInput,
} from './centers.ts'
import { toCounselError } from './errors.ts'

// 허용값 목록이 DB CHECK 와 TS 두 곳에 있다. 한쪽만 고치면 이 시험이 막는다.
const sql = await Deno.readTextFile(new URL('../supabase/migrations/20261008000001_centers.sql', import.meta.url))
function checkList(column: string): string[] {
  const m = new RegExp(`${column} [^\\n]*check \\(${column} (?:in \\(|<@ array\\[)([^\\]\\)]*)`, 's').exec(sql)
  if (!m) throw new Error(`CHECK for ${column} not found`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

Deno.test('허용값 목록이 DB CHECK 와 같다', () => {
  assertEquals(checkList('regions'), [...REGIONS])
  assertEquals(checkList('status'), [...CENTER_STATUSES])
  assertEquals(checkList('counseling_types'), [...COUNSELING_TYPES])
  assertEquals(checkList('delivery_modes'), [...DELIVERY_MODES])
})

Deno.test('권역 표시: 17개 전부면 전지역, 없으면 -, 그 밖에는 시·도 순서', () => {
  assertEquals(regionsLabel([...REGIONS]), '전지역')
  assertEquals(regionsLabel([]), '-')
  assertEquals(regionsLabel(['경기', '서울']), '서울, 경기')
})

Deno.test('유형·방식 표시는 정의 순서로 잇는다', () => {
  assertEquals(typesLabel(['family', 'individual']), '개인, 가족')
  assertEquals(modesLabel(['online', 'offline']), '대면 · 비대면')
  assertEquals(typesLabel([]), '-')
})

Deno.test('계약 기간 표시', () => {
  assertEquals(contractLabel(null, null), '-')
  assertEquals(contractLabel('2026-01-01', '2026-12-31'), '2026-01-01 ~ 2026-12-31')
  assertEquals(contractLabel('2026-01-01', null), '2026-01-01 ~')
})

Deno.test('목록 거르기: 이름은 대소문자 무시 부분 일치, 권역·상태는 정확히', () => {
  const rows = [
    { name: '마음숲 상담센터', regions: ['서울'], status: 'active' as const },
    { name: 'Onda 온라인상담', regions: ['서울', '경기'], status: 'paused' as const },
    { name: '바다빛 가족상담센터', regions: ['부산'], status: 'active' as const },
  ]
  assertEquals(filterCenters(rows, { q: '', region: '', status: '' }).length, 3)
  assertEquals(filterCenters(rows, { q: 'onda', region: '', status: '' }).map((r) => r.name), ['Onda 온라인상담'])
  assertEquals(filterCenters(rows, { q: '', region: '서울', status: 'active' }).map((r) => r.name), ['마음숲 상담센터'])
})

Deno.test('입력 검사', () => {
  assertEquals(validateCenterInput(EMPTY_CENTER_INPUT), { name: 'form.error.nameRequired' })
  const ok = { ...EMPTY_CENTER_INPUT, name: '마음숲', phone: '02-555-0101', contract_from: '2026-01-01', contract_to: '2026-12-31' }
  assertEquals(validateCenterInput(ok), {})
  assertEquals(validateCenterInput({ ...ok, phone: '02)555' }), { phone: 'form.error.phone' })
  assertEquals(validateCenterInput({ ...ok, contract_to: '2025-12-31' }), { contract_to: 'form.error.contractPeriod' })
  assertEquals(validateCenterInput({ ...ok, name: 'x'.repeat(61) }), { name: 'form.error.nameLength' })
})

Deno.test('DB 오류 문구에서 코드를 꺼낸다. 모르는 오류는 generic', () => {
  assertEquals(toCounselError({ message: 'COUNSEL:VERSION_CONFLICT', details: '3' }).code, 'VERSION_CONFLICT')
  assertEquals(toCounselError({ message: 'COUNSEL:VERSION_CONFLICT', details: '3' }).detail, '3')
  assertEquals(toCounselError({ message: 'COUNSEL:WHATEVER' }).code, 'generic')
  assertEquals(toCounselError(new Error('network')).code, 'generic')
})
