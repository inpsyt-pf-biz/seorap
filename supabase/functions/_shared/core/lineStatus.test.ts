import { assertEquals } from '@std/assert'
import { type LineInput, lineStatus } from './lineStatus.ts'

const base: LineInput = {
  issueStatus: 'issued', cancelStatus: 'none', cancelRejectReason: null, examStatus: null,
  examStatusEnabled: false, lockReasons: [], firstLaunchedAt: null, platformDeletedAt: null, forward: null,
}
const s = (o: Partial<LineInput>) => lineStatus({ ...base, ...o })

Deno.test('1 취소됨', () => assertEquals(s({ cancelStatus: 'cancelled' }), { label: '취소됨', tone: 'muted', actions: [] }))
Deno.test('2 취소 확인 중', () => assertEquals(s({ cancelStatus: 'checking' }).label, '취소 확인 중'))
Deno.test('3 준비 중 (발급 전·실패)', () => {
  assertEquals(s({ issueStatus: 'pending' }).label, '준비 중')
  assertEquals(s({ issueStatus: 'failed' }).actions, [])
})
Deno.test('4 사용할 수 없음 (폐기)', () => {
  assertEquals(s({ issueStatus: 'voided' }).actions, ['contact'])
  assertEquals(s({ platformDeletedAt: '2026-10-22T00:00:00Z' }).label, '사용할 수 없는 검사예요')
})
Deno.test('5 상담 신청서 잠금', () => assertEquals(s({ lockReasons: ['counsel_pending'] }), { label: '신청서 제출 후 열려요', tone: 'info', actions: ['counsel_form'] }))
Deno.test('6 그 밖 잠금, 여러 개 겹쳐도 상담이 먼저', () => {
  assertEquals(s({ lockReasons: ['admin_hold'] }).label, '확인 중')
  assertEquals(s({ lockReasons: ['admin_hold', 'counsel_pending'] }).label, '신청서 제출 후 열려요')
})
Deno.test('7~9 응시상태는 꺼져 있으면 무시', () => {
  assertEquals(s({ examStatus: 'completed' }).label, '실시 전')
  assertEquals(s({ examStatus: 'completed', examStatusEnabled: true }).label, '완료')
  assertEquals(s({ examStatus: 'in_progress', examStatusEnabled: true }).actions, ['continue'])
})
Deno.test('미사용은 firstLaunchedAt 앞에 와야 하고 forward가 없을 때만', () => {
  assertEquals(s({ examStatus: 'unused', examStatusEnabled: true, firstLaunchedAt: '2026-10-22T15:30:00Z' }), { label: '미사용', tone: 'neutral', actions: ['launch', 'forward'] })
  assertEquals(s({ examStatus: 'unused', examStatusEnabled: true, forward: { displayName: '홍길동', openedAt: null, codeExposed: false } }).label, '전달함 · 홍길동')
})
Deno.test('10 실시함', () => assertEquals(s({ firstLaunchedAt: '2026-10-22T15:30:00Z' }), { label: '실시함 (10-23)', tone: 'info', actions: ['continue'] }))
Deno.test('11 전달함, 코드 노출 전에는 다른 분께 가능', () => {
  const r = s({ forward: { displayName: '홍길동', openedAt: null, codeExposed: false } })
  assertEquals(r.label, '전달함 · 홍길동')
  assertEquals(r.actions, ['resend', 'reforward'])
  assertEquals(r.note, '아직 안 열어 봄')
})
Deno.test('11 전달함, 코드 노출 후에는 다른 분께 숨김', () => {
  const r = s({ forward: { displayName: '홍길동', openedAt: '2026-10-22T01:00:00Z', codeExposed: true } })
  assertEquals(r.actions, ['resend'])
  assertEquals(r.note, '받는 분이 열어 봄')
})
Deno.test('12 실시 전', () => assertEquals(s({}), { label: '실시 전', tone: 'neutral', actions: ['launch', 'forward'] }))
Deno.test('취소 거부 사유는 note로', () => {
  const r = s({ cancelStatus: 'rejected', cancelRejectReason: '이미 실시한 검사예요' })
  assertEquals(r.label, '실시 전')
  assertEquals(r.note, '취소할 수 없어요: 이미 실시한 검사예요')
})
