import { assert, assertEquals } from '@std/assert'
import { EMPTY_CENTER_INPUT, validateCenterInput } from './centers.ts'
import { KOREA_BOUNDS, SIDO_ANCHORS, groupBySido, hasCoordinates, isInKorea } from './geo.ts'
import { REGIONS } from './regions.ts'

Deno.test('좌표 범위가 DB CHECK 와 같다', () => {
  const sql = Deno.readTextFileSync(new URL('../supabase/migrations/20261012000001_center_coordinates.sql', import.meta.url))
  const lat = /latitude between (\d+) and (\d+)/.exec(sql)!
  const lng = /longitude between (\d+) and (\d+)/.exec(sql)!
  assertEquals([Number(lat[1]), Number(lat[2])], [KOREA_BOUNDS.minLat, KOREA_BOUNDS.maxLat])
  assertEquals([Number(lng[1]), Number(lng[2])], [KOREA_BOUNDS.minLng, KOREA_BOUNDS.maxLng])
})

Deno.test('국내 좌표만 받는다 (제주·독도·백령 포함)', () => {
  assert(isInKorea({ lat: 33.25, lng: 126.56 })) // 서귀포
  assert(isInKorea({ lat: 37.24, lng: 131.87 })) // 독도
  assert(isInKorea({ lat: 37.97, lng: 124.71 })) // 백령도
  assert(!isInKorea({ lat: 35.68, lng: 139.69 })) // 도쿄
  assert(!isInKorea({ lat: 0, lng: 0 }))
})

Deno.test('시·도 동그라미 자리가 17개 모두 있고 국내에 있다', () => {
  assertEquals(Object.keys(SIDO_ANCHORS).sort(), [...REGIONS].sort())
  for (const p of Object.values(SIDO_ANCHORS)) assert(isInKorea(p))
})

Deno.test('시·도별 센터 수: 소재지 없는 센터는 빼고, 시·도 목록 순서로', () => {
  const rows = [{ location_sido: '경기' }, { location_sido: '서울' }, { location_sido: '서울' }, { location_sido: null }]
  assertEquals(groupBySido(rows), [{ sido: '서울', count: 2 }, { sido: '경기', count: 1 }])
  assertEquals(groupBySido([]), [])
})

Deno.test('위치가 있는 센터만 핀으로 찍는다', () => {
  assert(hasCoordinates({ latitude: 37.5, longitude: 127 }))
  assert(!hasCoordinates({ latitude: null, longitude: null }))
})

Deno.test('입력 검사: 위치는 둘 다 있거나 둘 다 없어야 하고, 국내여야 한다', () => {
  const ok = { ...EMPTY_CENTER_INPUT, name: '마음숲' }
  assertEquals(validateCenterInput({ ...ok, latitude: 37.51, longitude: 127.04 }), {})
  assertEquals(validateCenterInput({ ...ok, latitude: 37.51, longitude: null }), { latitude: 'form.error.position' })
  assertEquals(validateCenterInput({ ...ok, latitude: 35.68, longitude: 139.69 }), { latitude: 'form.error.position' })
})
