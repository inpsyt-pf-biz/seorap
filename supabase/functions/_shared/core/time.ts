const KST_MS = 9 * 60 * 60 * 1000
const p2 = (n: number) => String(n).padStart(2, '0')

function kst(d: Date) {
  const k = new Date(d.getTime() + KST_MS)
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), h: k.getUTCHours(), mi: k.getUTCMinutes() }
}

export function formatKstDate(iso: string): string {
  const x = kst(new Date(iso))
  return `${x.y}-${p2(x.m)}-${p2(x.d)}`
}

export function formatKstMonthDay(iso: string): string {
  const x = kst(new Date(iso))
  return `${p2(x.m)}-${p2(x.d)}`
}

export function formatKstDateTime(iso: string): string {
  const x = kst(new Date(iso))
  return `${x.y}-${p2(x.m)}-${p2(x.d)} ${p2(x.h)}:${p2(x.mi)}`
}

export function isNightKst(d: Date): boolean {
  const h = kst(d).h
  return h >= 21 || h < 8
}

export function kstDayStart(d: Date): Date {
  const x = kst(d)
  return new Date(Date.UTC(x.y, x.m - 1, x.d) - KST_MS)
}

export function nextKstMidnight(d: Date): Date {
  const x = kst(d)
  return new Date(Date.UTC(x.y, x.m - 1, x.d + 1) - KST_MS)
}
