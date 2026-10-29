import type { CounselFormResponse, CounselSubmitResponse } from '../../_shared/core/apiTypes.ts'
import { checkAnswers, splitAnswers, type Answers } from '../../_shared/core/counselForm.ts'
import { counsel, counselItems, type CounselItem } from '../lib/counsel.ts'
import { db, must } from '../lib/db.ts'
import { logEvent } from '../lib/events.ts'
import { ApiError, json, readJson } from '../lib/http.ts'
import { requireSession, type Session } from '../lib/session.ts'
import { getSettings, type Settings } from '../lib/settings.ts'

// 상담 신청서 (B2, build-spec §4-6). 문항은 상담 어드민의 템플릿에서 가져오고, 답은 서랍에 남기지 않고 상담 원장으로 넘긴다.
// 제출이 원장에 들어간 뒤에만 서랍에 제출 기록을 남기고 그 주문의 검사 잠금을 푼다.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 민감정보가 든 신청서라, 인증한 지 오래된 세션(공용 기기에 남은 화면 등)으로는 열거나 내지 못한다
function requireFresh(sess: Session, maxMin: number) {
  if (Date.parse(sess.authAt) + maxMin * 60_000 < Date.now()) throw new ApiError('REAUTH_REQUIRED', { reason: 'counsel_fresh_auth' })
}

async function myCounselItem(sess: Session, orderId: unknown): Promise<CounselItem> {
  if (typeof orderId !== 'string' || !UUID_RE.test(orderId)) throw new ApiError('NOT_OWNER')
  // 남의 주문과 없는 주문을 똑같이 거부한다
  const order = must(await db().from('orders').select('id, recipient_id').eq('id', orderId).maybeSingle(), 'counsel order read') as
    { id: string; recipient_id: string } | null
  if (!order || order.recipient_id !== sess.recipientId) throw new ApiError('NOT_OWNER')
  const [item] = await counselItems([orderId])
  if (!item) throw new ApiError('CONFLICT', { reason: 'no_counsel' })
  return item
}

async function formOf(item: CounselItem, s: Settings) {
  const form = item.manageCode ? await counsel(s).formFor(item.manageCode) : null
  if (!form) throw new ApiError('CONFLICT', { reason: 'no_form' })
  return form
}

export async function counselForm(req: Request): Promise<Response> {
  const sess = await requireSession(req)
  const { orderId } = await readJson<{ orderId: unknown }>(req)
  const s = await getSettings()
  const item = await myCounselItem(sess, orderId)
  if (item.submittedAt) throw new ApiError('CONFLICT', { reason: 'already_submitted' })
  requireFresh(sess, s.counsel_open_max_min)
  const form = await formOf(item, s)
  const body: CounselFormResponse = {
    orderId: item.orderId, productName: item.productName, templateId: form.templateId, version: form.version, definition: form.definition,
  }
  return json(200, body)
}

export async function counselSubmit(req: Request): Promise<Response> {
  const sess = await requireSession(req)
  const b = await readJson<{ orderId: unknown; templateId: unknown; version: unknown; answers: unknown; clientRequestId: unknown }>(req)
  if (typeof b.clientRequestId !== 'string' || !UUID_RE.test(b.clientRequestId)) throw new ApiError('VALIDATION', { field: 'clientRequestId' })
  if (typeof b.answers !== 'object' || b.answers === null || Array.isArray(b.answers)) throw new ApiError('VALIDATION', { field: 'answers' })
  const s = await getSettings()
  const item = await myCounselItem(sess, b.orderId)
  const done: CounselSubmitResponse = { submitted: true }
  // 이미 낸 주문은 다시 넘기지 않는다 (연타·재시도)
  if (item.submittedAt) return json(200, done)
  requireFresh(sess, s.counsel_submit_max_min)

  const form = await formOf(item, s)
  // 신청서를 연 뒤 관리자가 새 판을 게시했으면 다시 불러오게 한다 (동의 문구가 바뀌었을 수 있다)
  if (b.templateId !== form.templateId || b.version !== form.version) throw new ApiError('CONFLICT', { reason: 'form_changed' })
  const answers = b.answers as Answers
  const problems = checkAnswers(form.definition, answers)
  if (Object.keys(problems).length) throw new ApiError('VALIDATION', { field: 'answers', problems })

  const split = splitAnswers(form.definition, answers)
  const thirdParty = split.consents.some((c) => c.kind === 'third_party' && c.agreed)
  const ledger = await counsel(s).submit({
    naver_product_order_id: item.naverProductOrderId, external_order_id: item.externalOrderId, manage_code: item.manageCode!,
    product_name: item.productName, template_id: form.templateId, template_version: form.version, submitted_at: new Date().toISOString(),
    application: { ...split.standard, ...split.sensitive, consent_third_party: thirdParty },
    extra: split.extra, sensitive_extra: split.sensitiveExtra, consents: split.consents,
  })

  must(await db().rpc('counsel_record_submission', {
    p_order_id: item.orderId, p_order_item_id: item.orderItemId, p_template_id: form.templateId, p_template_version: form.version,
    p_purchase_id: ledger.purchaseId, p_client_request_id: b.clientRequestId,
  }), 'counsel record')
  // 답 원문은 기록하지 않는다 (판 번호만)
  await logEvent('counsel_submitted', { recipientId: sess.recipientId, orderId: item.orderId, props: { version: form.version } })
  return json(200, done)
}
