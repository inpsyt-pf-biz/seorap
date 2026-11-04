// 상담 예약 상태 (11-04, 시나리오 §5-1). 검사는 신청서 제출이 아니라 센터의 예약 확정 뒤에 열린다.
// 서랍 서버가 상담 어드민의 회차 줄(rpc_seorap_counsel_status)을 받아 이 규칙으로 판정하고, 서랍 화면이 문구를 만든다.

export type CounselSessionRow = {
  purchase_id: string
  seq: number
  status: string
  scheduled_at: string | null
  center_name: string | null
}
export type BookingState = 'waiting' | 'confirmed' | 'completed'
export type Booking = { state: BookingState; scheduledAt: string | null; centerName: string | null }

const WAITING: Booking = { state: 'waiting', scheduledAt: null, centerName: null }
const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY)

// 확정된 회차가 있으면 확정(가장 이른 일시), 없고 마친 회차가 있으면 완료(마지막 회차), 그 밖(배정 전·요청·불가·취소)은 대기.
// 센터 배정(예약 요청)만으로는 고객에게 센터 이름을 보이지 않는다. 센터가 아직 연락하지 않았을 수 있다
export function bookingOf(rows: CounselSessionRow[]): Booking {
  const confirmed = rows.filter((r) => r.status === 'confirmed').sort((a, b) => time(a.scheduled_at) - time(b.scheduled_at))
  if (confirmed.length) return { state: 'confirmed', scheduledAt: confirmed[0].scheduled_at, centerName: confirmed[0].center_name }
  const completed = rows.filter((r) => r.status === 'completed').sort((a, b) => b.seq - a.seq)
  if (completed.length) return { state: 'completed', scheduledAt: completed[0].scheduled_at, centerName: completed[0].center_name }
  return WAITING
}

export const opensTests = (b: Booking) => b.state !== 'waiting'

const KST_MS = 9 * 60 * 60 * 1000
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
function kst(iso: string) {
  const k = new Date(Date.parse(iso) + KST_MS)
  return { m: k.getUTCMonth() + 1, d: k.getUTCDate(), w: k.getUTCDay(), h: k.getUTCHours(), mi: k.getUTCMinutes(), date: k }
}
const dayText = (x: { m: number; d: number; w: number }) => `${x.m}월 ${x.d}일(${DAYS[x.w]})`

// "11월 26일(목) 오후 2시", 분이 있으면 "오후 2시 30분"
export function bookingWhen(iso: string): string {
  const x = kst(iso)
  const half = x.h < 12 ? '오전' : '오후'
  const h12 = x.h % 12 === 0 ? 12 : x.h % 12
  return `${dayText(x)} ${half} ${h12}시${x.mi ? ` ${x.mi}분` : ''}`
}

// 검사 완료 권장일: 상담일(한국 날짜) 3일 전. 상담사가 결과를 보고 해석을 준비할 시간 (시나리오 목표 D-3)
export function testDueDay(iso: string): string {
  const x = kst(iso)
  const due = new Date(Date.UTC(x.date.getUTCFullYear(), x.date.getUTCMonth(), x.date.getUTCDate() - 3))
  return dayText({ m: due.getUTCMonth() + 1, d: due.getUTCDate(), w: due.getUTCDay() })
}
