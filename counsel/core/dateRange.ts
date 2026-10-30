// 기간 달력(구매 건 기간 거르기). 날짜는 모두 한국 날짜 'YYYY-MM-DD' 글자로 다룬다(시각대 계산을 달력에 들이지 않게).
// 첫 클릭은 시작일, 둘째 클릭은 종료일. 둘째 클릭이 시작일보다 앞이면 둘을 바꾼다.

export type DateRange = { from: string; to: string }

const p2 = (n: number) => String(n).padStart(2, '0')
export const ymd = (y: number, m: number, d: number) => `${y}-${p2(m)}-${p2(d)}`

// 달을 옮긴다(m 은 1~12)
export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const i = y * 12 + (m - 1) + delta
  return { y: Math.floor(i / 12), m: (i % 12) + 1 }
}

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

// 한 달 달력: 일요일 시작, 주마다 7칸, 그 달이 아닌 칸은 null
export function monthGrid(y: number, m: number): (string | null)[][] {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: (string | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => ymd(y, m, i + 1))]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
}

// 고르는 중의 상태: 시작일만 정해졌으면 pending, 둘 다 정해지면 끝
export type Picking = { start: string | null }

export function pickDay(picking: Picking, day: string): { picking: Picking; done: DateRange | null } {
  if (!picking.start) return { picking: { start: day }, done: null }
  const [from, to] = day < picking.start ? [day, picking.start] : [picking.start, day]
  return { picking: { start: null }, done: { from, to } }
}

// 달력 칸의 모양: 시작·끝(진한 채움), 사이(옅은 채움). 시작일만 고른 동안은 마우스가 가리키는 날까지 미리 보여 준다
export function dayRole(day: string, range: DateRange | null, picking: Picking, hover: string | null): 'edge' | 'between' | null {
  let from = range?.from ?? ''
  let to = range?.to ?? ''
  if (picking.start) {
    const other = hover ?? picking.start
    ;[from, to] = other < picking.start ? [other, picking.start] : [picking.start, other]
  }
  if (!from || !to) return null
  if (day === from || day === to) return 'edge'
  return day > from && day < to ? 'between' : null
}

// 두 날짜 사이의 날 수(to - from). 같은 날이면 0
export const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
