import type { BoxGroup, BoxLine, BoxResponse, HistoryItem, HistoryResponse, HistoryResult } from '../../_shared/core/apiTypes.ts'
import { type LineInput, lineStatus } from '../../_shared/core/lineStatus.ts'
import { formatPhone, maskPhone } from '../../_shared/core/phone.ts'
import { decrypt } from '../../_shared/crypto.ts'
import { db, must } from './db.ts'
import { type VoucherRow, VOUCHER_COLS } from './ownership.ts'
import type { Settings } from './settings.ts'

type ForwardRow = {
  id: string; actor_type: string; delivery_mode: 'seorap_message' | 'direct_share'
  to_name_enc: string | null; to_name_masked: string | null; to_phone_enc: string | null; to_phone_last4: string | null; access_link_id: string | null
}

async function forwardDisplay(f: Omit<ForwardRow, 'id' | 'delivery_mode' | 'access_link_id'>): Promise<{ name: string; phone: string }> {
  // 본인이 입력한 값은 본인에게 그대로 보여 준다. 어드민이 대신 보낸 것은 가린다.
  if (f.actor_type === 'recipient' && f.to_name_enc && f.to_phone_enc) {
    return { name: await decrypt('A', f.to_name_enc), phone: formatPhone(await decrypt('A', f.to_phone_enc)) }
  }
  // 가린 번호도 앞자리는 실제 번호를 따른다 (011·016 등을 010 으로 보이지 않게). 원문이 없으면 끝 4자리만.
  const phone = f.to_phone_enc ? maskPhone(await decrypt('A', f.to_phone_enc)) : f.to_phone_last4 ? `****-${f.to_phone_last4}` : ''
  return { name: f.to_name_masked ?? '', phone }
}

export async function lineInputs(vouchers: VoucherRow[], s: Settings) {
  // 조회 오류를 빈 결과로 바꾸면 전달한 줄이 "시작 전"으로 보이므로 must 로 502 를 올린다
  const fwdIds = vouchers.map((v) => v.current_forward_id).filter((x): x is string => !!x)
  const fwds = fwdIds.length
    ? must(
      await db().from('voucher_forwards').select('id, actor_type, delivery_mode, to_name_enc, to_name_masked, to_phone_enc, to_phone_last4, access_link_id').in('id', fwdIds),
      'forwards read',
    ) as ForwardRow[]
    : []
  const linkIds = fwds.map((f) => f.access_link_id).filter((x): x is string => !!x)
  const links = linkIds.length
    ? must(
      await db().from('access_links').select('id, first_opened_at, code_exposed_at').in('id', linkIds),
      'forward links read',
    ) as { id: string; first_opened_at: string | null; code_exposed_at: string | null }[]
    : []
  const fwdById = new Map(fwds.map((f) => [f.id, f]))
  const linkById = new Map(links.map((l) => [l.id, l]))

  const out = new Map<string, { input: LineInput; forwardTo: { name: string; phone: string } | null }>()
  for (const v of vouchers) {
    const f = v.current_forward_id ? fwdById.get(v.current_forward_id) : undefined
    const link = f?.access_link_id ? linkById.get(f.access_link_id) : undefined
    // 직접 공유는 받는 분이 기록되지 않으므로 이름·번호 줄을 만들지 않는다
    const direct = f?.delivery_mode === 'direct_share'
    const forwardTo = f && !direct ? await forwardDisplay(f) : null
    out.set(v.id, {
      forwardTo,
      input: {
        issueStatus: v.issue_status,
        cancelStatus: v.cancel_status,
        cancelRejectReason: null, // Plan C에서 cancellations.reject_reason 연결
        examStatus: v.exam_status,
        examStatusEnabled: s.exam_status_enabled,
        lockReasons: v.lock_reasons ?? [],
        firstLaunchedAt: v.first_launched_at,
        platformDeletedAt: v.platform_deleted_at,
        codeExposedAt: v.first_code_exposed_at,
        forward: f
          ? { displayName: forwardTo?.name ?? '', openedAt: link?.first_opened_at ?? null, codeExposed: !!link?.code_exposed_at, direct }
          : null,
      },
    })
  }
  return out
}

function windowStart(s: Settings): string {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - s.box_window_months)
  return d.toISOString()
}

async function myVouchers(recipientId: string, s: Settings) {
  const orders = must(
    await db().from('orders').select('id, paid_at').eq('recipient_id', recipientId)
      .gte('paid_at', windowStart(s)).order('paid_at', { ascending: false }),
    'orders read',
  ) as { id: string; paid_at: string }[]
  const orderIds = orders.map((o) => o.id)
  if (!orderIds.length) return { orders: [], items: [], vouchers: [] as VoucherRow[] }
  const items = must(
    await db().from('order_items').select('id, order_id, product_name').in('order_id', orderIds)
      .order('created_at', { ascending: true }).order('id', { ascending: true }),
    'order items read',
  ) as { id: string; order_id: string; product_name: string }[]
  const vouchers = must(
    await db().from('vouchers').select(VOUCHER_COLS).in('order_id', orderIds).neq('issue_status', 'replaced')
      .order('created_at', { ascending: true }).order('unit_no', { ascending: true })
      .order('test_item_id', { ascending: true }).order('id', { ascending: true }),
    'vouchers read',
  ) as unknown as VoucherRow[]
  return { orders, items, vouchers }
}

export async function buildBox(recipientId: string, s: Settings): Promise<BoxResponse> {
  const rec = must(await db().from('recipients').select('name_enc').eq('id', recipientId).single(), 'recipient read') as { name_enc: string | null }
  const { orders, items, vouchers } = await myVouchers(recipientId, s)
  const inputs = await lineInputs(vouchers, s)
  const unitsOf = new Map<string, number>()
  for (const v of vouchers) unitsOf.set(`${v.order_item_id}|${v.test_item_id}`, (unitsOf.get(`${v.order_item_id}|${v.test_item_id}`) ?? 0) + 1)

  const groups: BoxGroup[] = orders.map((o) => {
    const mine = vouchers.filter((v) => v.order_id === o.id)
    const lines: BoxLine[] = mine.map((v) => {
      const li = inputs.get(v.id)!
      return {
        voucherId: v.id, testItemId: v.test_item_id, testName: v.test_name, unitNo: v.unit_no,
        unitsOfTest: unitsOf.get(`${v.order_item_id}|${v.test_item_id}`) ?? 1,
        status: lineStatus(li.input), firstLaunchedAt: v.first_launched_at, forwardTo: li.forwardTo,
      }
    })
    const productName = items.find((i) => i.order_id === o.id)?.product_name ?? ''
    // 줄이 없거나, 준비 중(발급 대기·실패)인 줄이 있거나, 아직 할 일(실시·전달·상담 신청·문의)이 남은 줄이 있으면 끝난 묶음이 아니다
    const done = lines.length > 0
      && !mine.some((v) => ['pending', 'failed'].includes(inputs.get(v.id)!.input.issueStatus))
      && !lines.some((l) => l.status.actions.some((a) => a === 'launch' || a === 'forward' || a === 'counsel_form' || a === 'contact'))
    return { orderId: o.id, purchasedAt: o.paid_at, productName, lineCount: lines.length, done, lines }
  })
  return {
    ownerName: rec.name_enc ? await decrypt('A', rec.name_enc) : '',
    notStartedCount: groups.flatMap((g) => g.lines).filter((l) => l.status.actions.includes('launch')).length,
    noticeBanner: s.notice_banner,
    groups,
  }
}

function resultOf(r: { final_status: string | null; final_media: string | null }): HistoryResult | null {
  if (!r.final_status) return null
  if (r.final_status === 'delivered') return r.final_media === 'alimtalk' ? 'delivered_alimtalk' : 'delivered_sms'
  if (r.final_status === 'failed') return 'failed'
  return 'sending'
}

type LogRow = {
  id: string; voucher_id: string; action: HistoryItem['action']; actor_type: string; created_at: string
  to_name_enc: string | null; to_name_masked: string | null; to_phone_enc: string | null; to_phone_last4: string | null
  final_status: string | null; final_media: string | null; first_opened_at: string | null
}

export async function buildHistory(recipientId: string, s: Settings): Promise<HistoryResponse> {
  const { vouchers } = await myVouchers(recipientId, s)
  if (!vouchers.length) return { items: [] }
  const rows = must(
    await db().from('v_forward_log')
      .select('id, voucher_id, action, actor_type, created_at, to_name_enc, to_name_masked, to_phone_enc, to_phone_last4, final_status, final_media, first_opened_at')
      .in('voucher_id', vouchers.map((v) => v.id)).order('created_at', { ascending: false }),
    'forward log read',
  ) as LogRow[]
  const byId = new Map(vouchers.map((v) => [v.id, v]))
  const items: HistoryItem[] = []
  for (const r of rows) {
    const v = byId.get(r.voucher_id)!
    const disp = r.to_name_enc || r.to_name_masked ? await forwardDisplay(r) : null
    items.push({
      id: r.id, at: r.created_at, action: r.action, testName: v.test_name, unitNo: v.unit_no,
      toName: disp?.name ?? null, toPhone: disp?.phone ?? null, result: resultOf(r), openedAt: r.first_opened_at,
    })
  }
  // 취소 줄에는 이름이 없으므로, 바로 앞(시간상 이전) 전달의 이름을 붙인다
  for (let i = 0; i < items.length; i++) {
    if (items[i].action === 'cancel') {
      const prev = items.slice(i + 1).find((x) => x.action !== 'cancel' && rowsVoucher(rows, x.id) === rowsVoucher(rows, items[i].id))
      items[i].toName = prev?.toName ?? null
    }
  }
  return { items }
}

function rowsVoucher(rows: { id: string; voucher_id: string }[], id: string): string | undefined {
  return rows.find((r) => r.id === id)?.voucher_id
}
