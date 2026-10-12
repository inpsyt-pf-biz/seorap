// 시·도 17개. 출처: teacherson-admin/lib/regions.ts (REGION_OPTIONS). 소재지·상담 가능 지역·지도 동그라미가 같은 목록을 쓴다.
export const REGIONS = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
] as const
export type Region = (typeof REGIONS)[number]
