import { assertEquals } from '@std/assert'
import { type LineInput, lineStatus } from './lineStatus.ts'

const base: LineInput = {
  issueStatus: 'issued', cancelStatus: 'none', cancelRejectReason: null, examStatus: null,
  examStatusEnabled: false, lockReasons: [], firstLaunchedAt: null, platformDeletedAt: null, codeExposedAt: null, forward: null,
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
  assertEquals(s({ examStatus: 'unused', examStatusEnabled: true, forward: { displayName: '홍길동', openedAt: null, codeExposed: false, direct: false } }).label, '전달함 · 홍길동')
})
Deno.test('10 실시함은 [결과 보기]만 (이어서 하기는 응시 중일 때만)', () => {
  assertEquals(s({ firstLaunchedAt: '2026-10-22T15:30:00Z' }), { label: '실시함 (10-23)', tone: 'info', actions: ['result'] })
  // 응시 상태를 켠 뒤에도 실시함 줄에는 이어서 하기가 없다 (응시 중이어야만 이어서 하기)
  const launched = '2026-10-22T15:30:00Z'
  assertEquals(s({ firstLaunchedAt: launched, examStatusEnabled: true, examStatus: null }).actions, ['result'])
  assertEquals(s({ firstLaunchedAt: launched, examStatusEnabled: true, examStatus: 'in_progress' }), { label: '응시 중', tone: 'info', actions: ['continue'] })
  assertEquals(s({ firstLaunchedAt: launched, examStatusEnabled: true, examStatus: 'completed' }), { label: '완료', tone: 'success', actions: ['result_help'] })
})
Deno.test('11 전달함, 코드 노출 전에는 다른 분께 가능', () => {
  const r = s({ forward: { displayName: '홍길동', openedAt: null, codeExposed: false, direct: false } })
  assertEquals(r.label, '전달함 · 홍길동')
  assertEquals(r.actions, ['resend', 'reforward'])
  assertEquals(r.note, '아직 안 열어 봄')
})
Deno.test('11 전달함, 코드 노출 후에는 다른 분께 숨김', () => {
  const r = s({ forward: { displayName: '홍길동', openedAt: '2026-10-22T01:00:00Z', codeExposed: true, direct: false } })
  assertEquals(r.actions, ['resend'])
  assertEquals(r.note, '받는 분이 열어 봄')
})
Deno.test('11 링크로 직접 공유한 줄: 이름 없이 별도 상태, 다시 보내기 없음', () => {
  const r = s({ forward: { displayName: '', openedAt: null, codeExposed: false, direct: true } })
  assertEquals(r, { label: '링크로 전달함', tone: 'info', actions: ['reforward'], note: '아직 안 열어 봄' })
})
Deno.test('11 링크로 직접 공유한 줄: 받는 분이 코드를 봤으면 버튼 없음', () => {
  const r = s({ forward: { displayName: '', openedAt: '2026-10-22T01:00:00Z', codeExposed: true, direct: true } })
  assertEquals(r, { label: '링크로 전달함', tone: 'info', actions: [], note: '받는 분이 열어 봄' })
})
Deno.test('11-1 본인이 코드를 본 줄은 실시만 (전달 불가, 코드 보기는 화면이 그대로 둔다)', () => {
  assertEquals(s({ codeExposedAt: '2026-10-22T15:30:00Z' }), { label: '코드 확인함 · 10-23', tone: 'info', actions: ['launch'] })
})
Deno.test('11-1 코드 확인보다 실시함·전달함·취소·잠금이 먼저', () => {
  const at = '2026-10-22T15:30:00Z'
  assertEquals(s({ codeExposedAt: at, firstLaunchedAt: at }).label, '실시함 (10-23)')
  assertEquals(s({ codeExposedAt: at, forward: { displayName: '홍길동', openedAt: null, codeExposed: true, direct: false } }).label, '전달함 · 홍길동')
  assertEquals(s({ codeExposedAt: at, cancelStatus: 'cancelled' }).label, '취소됨')
  assertEquals(s({ codeExposedAt: at, lockReasons: ['admin_hold'] }).label, '확인 중')
})
Deno.test('12 실시 전', () => assertEquals(s({}), { label: '실시 전', tone: 'neutral', actions: ['launch', 'forward'] }))
Deno.test('취소 거부 사유는 note로', () => {
  const r = s({ cancelStatus: 'rejected', cancelRejectReason: '이미 실시한 검사예요' })
  assertEquals(r.label, '실시 전')
  assertEquals(r.note, '취소할 수 없어요: 이미 실시한 검사예요')
})
