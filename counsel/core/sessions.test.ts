import { assertEquals } from '@std/assert'
import { SESSION_STATUSES } from './purchases.ts'
import { ACTIONS_BY_STATUS, SESSION_ACTIONS, actionLabel, allowedActions, kstLocalToIso, validateSessionAction } from './sessions.ts'

const sql = Deno.readTextFileSync(new URL('../supabase/migrations/20261012000005_mvp2_sessions_notes_inbox.sql', import.meta.url))

// DB 함수의 분기 "p_action = 'x' and s.status in (...)" 를 읽어 화면 규칙과 맞춰 본다
function dbRules(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const m of sql.matchAll(/p_action = '(\w+)' and s\.status (?:= '(\w+)'|in \(([^)]*)\))/g)) {
    out[m[1]] = m[2] ? [m[2]] : [...m[3].matchAll(/'(\w+)'/g)].map((x) => x[1])
  }
  return out
}

Deno.test('상태마다 할 수 있는 일이 DB 함수와 같다', () => {
  const db = dbRules()
  assertEquals(Object.keys(db).sort(), [...SESSION_ACTIONS].sort())
  for (const action of SESSION_ACTIONS) {
    const fromUi = SESSION_STATUSES.filter((s) => ACTIONS_BY_STATUS[s].includes(action))
    assertEquals(fromUi.sort(), db[action].sort(), action)
  }
  assertEquals(allowedActions('completed'), [])
  assertEquals(actionLabel('confirm'), '예약 확정')
})

Deno.test('입력 검사: 예약 일시·사유가 필요한 일', () => {
  const base = { scheduledAt: '', method: '' as const, reason: '' }
  assertEquals(validateSessionAction({ ...base, action: 'confirm' }), { scheduledAt: 'session.error.scheduleRequired' })
  assertEquals(validateSessionAction({ ...base, action: 'reschedule', scheduledAt: '2026-10-20T10:00' }), { reason: 'session.error.reasonRequired' })
  assertEquals(validateSessionAction({ ...base, action: 'complete' }), {})
  assertEquals(validateSessionAction({ ...base, action: 'cancel', reason: '가'.repeat(501) }), { reason: 'session.error.reasonLength' })
  assertEquals(kstLocalToIso('2026-10-15T17:00'), '2026-10-15T17:00:00+09:00')
})
