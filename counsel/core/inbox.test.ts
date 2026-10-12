import { assertEquals } from '@std/assert'
import { inboxCandidates, maskedNameMatches, type InboxItem } from './inbox.ts'
import type { PurchaseRow } from './purchases.ts'

const purchase = (id: string, opts: { name?: string; tel?: string; type?: PurchaseRow['purchase_type']; paid?: string; hasApp?: boolean }): PurchaseRow => ({
  id, purchase_type: opts.type === undefined ? 'test_main' : opts.type, product_name: null, paid_at: opts.paid ?? null, source: 'naver',
  created_at: '2026-10-01T00:00:00Z',
  applications: opts.hasApp ? { client_name: 'x', guardian_name: null, test_name: null, submitted_at: null, residence: null, preferred_method: null, preferred_schedule: null } : null,
  naver_product_orders: null,
  naver_orderers: { name_masked: opts.name ?? null, tel_masked: opts.tel ?? null },
  sessions: [],
})

const item: InboxItem = {
  id: 'i1', purchase_type: 'test_main', submitted_at: '2026-10-05T10:00:00+09:00', client_name: '거너더', guardian_name: '거보호',
  client_phone: '010-0000-1999', guardian_phone: '010-0000-2116', test_name: null, naver_product_order_id: null, created_at: '2026-10-05T00:00:00Z',
}

Deno.test('가린 이름 맞추기: 길이·첫 글자·끝 글자', () => {
  assertEquals(maskedNameMatches('거*호', '거보호'), true)
  assertEquals(maskedNameMatches('거*호', '거보'), false)
  assertEquals(maskedNameMatches('이*', '이샘'), true)
  assertEquals(maskedNameMatches(null, '이샘'), false)
})

Deno.test('후보: 연락처 끝 4자리·이름이 맞는 건만, 점수 순, 신청서가 이미 있으면 뺀다', () => {
  const rows = [
    purchase('phone+name+type+date', { name: '거*호', tel: '010-****-2116', paid: '2026-10-04T09:00:00+09:00' }),
    purchase('phone-only', { name: '김*시', tel: '***-****-1999', type: 'group_buy' }),
    purchase('name-only', { name: '거*호', tel: '010-****-0000', type: 'group_buy' }),
    purchase('nothing', { name: '박*수', tel: '010-****-5555' }),
    purchase('has-app', { name: '거*호', tel: '010-****-2116', hasApp: true }),
  ]
  const c = inboxCandidates(item, rows)
  assertEquals(c.map((x) => [x.purchase.id, x.score]), [['phone+name+type+date', 7], ['phone-only', 3], ['name-only', 2]])
  assertEquals(c[0].reasons, ['phone', 'name', 'type', 'date'])
})
