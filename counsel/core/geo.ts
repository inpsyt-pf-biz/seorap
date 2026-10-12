// 지도 위치 규칙. 좌표 범위는 DB CHECK(20261012000001_center_coordinates.sql)와 같다.
import { REGIONS, type Region } from './regions.ts'

export const KOREA_BOUNDS = { minLat: 33, maxLat: 39, minLng: 124, maxLng: 132 } as const

// 전국이 한 화면에 들어오는 처음 위치
export const KOREA_VIEW = { lat: 36.2, lng: 127.8, zoom: 7 } as const

export type LatLng = { lat: number; lng: number }

export function isInKorea(p: LatLng): boolean {
  return p.lat >= KOREA_BOUNDS.minLat && p.lat <= KOREA_BOUNDS.maxLat && p.lng >= KOREA_BOUNDS.minLng && p.lng <= KOREA_BOUNDS.maxLng
}

// 전국 화면에서 시·도별 숫자 동그라미를 놓는 자리. 행정구역 중심이 아니라, 서울·인천·경기처럼 붙어 있는 곳이
// 겹치지 않게 조금씩 떨어뜨린 표시용 자리다.
export const SIDO_ANCHORS: Record<Region, LatLng> = {
  서울: { lat: 37.5665, lng: 126.978 },
  부산: { lat: 35.1796, lng: 129.0756 },
  대구: { lat: 35.8714, lng: 128.6014 },
  인천: { lat: 37.45, lng: 126.45 },
  광주: { lat: 35.1595, lng: 126.8526 },
  대전: { lat: 36.3, lng: 127.5 },
  울산: { lat: 35.5384, lng: 129.3114 },
  세종: { lat: 36.62, lng: 127.15 },
  경기: { lat: 37.35, lng: 127.55 },
  강원: { lat: 37.75, lng: 128.3 },
  충북: { lat: 36.8, lng: 127.75 },
  충남: { lat: 36.45, lng: 126.7 },
  전북: { lat: 35.72, lng: 127.15 },
  전남: { lat: 34.8, lng: 127.1 },
  경북: { lat: 36.35, lng: 128.85 },
  경남: { lat: 35.3, lng: 128.3 },
  제주: { lat: 33.4, lng: 126.55 },
}

export type SidoGroup = { sido: Region; count: number }

// 시·도별 센터 수. 소재지 시·도가 없는 센터는 세지 않는다. 시·도 목록 순서로 돌려준다.
export function groupBySido(rows: { location_sido: string | null }[]): SidoGroup[] {
  const counts = new Map<string, number>()
  for (const r of rows) if (r.location_sido) counts.set(r.location_sido, (counts.get(r.location_sido) ?? 0) + 1)
  return REGIONS.filter((s) => counts.has(s)).map((s) => ({ sido: s, count: counts.get(s)! }))
}

export function hasCoordinates<T extends { latitude: number | null; longitude: number | null }>(c: T): c is T & { latitude: number; longitude: number } {
  return c.latitude !== null && c.longitude !== null
}
