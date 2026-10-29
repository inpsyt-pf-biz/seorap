import type { ReactNode } from 'react'
import { Alert, Box, Divider, Stack, Typography } from '@mui/material'
import { formatKstDateTime } from '@seorap-core/time.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { naverCodeLabel, won } from '@counsel-core/naverOrder.ts'
import { purchaseTypeLabel } from '@counsel-core/purchases.ts'
import type { PurchaseDetail } from '../lib/api'

// 구매 건 상세 페이지의 신청서·네이버 주문 탭. 칸 이름표와 빈 값 표시(-)를 한곳에서 맞춘다.
export function Row({ label, value }: { label: CopyKey; value: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '170px 1fr' }, gap: { xs: 0.25, sm: 2 }, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">{t(label)}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-line', wordBreak: 'break-all' }}>{value === null || value === undefined || value === '' ? t('center.empty') : value}</Typography>
    </Box>
  )
}

// 템플릿 문항의 질문을 이름표로 쓰는 줄 (신청서 추가 답변). 이름표가 문구 사전 키가 아니라 질문 그대로다
function AnswerRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '170px 1fr' }, gap: { xs: 0.25, sm: 2 }, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-line', wordBreak: 'break-all' }}>{value || t('center.empty')}</Typography>
    </Box>
  )
}

export function Section({ title, note, children }: { title: CopyKey; note?: CopyKey; children: ReactNode }) {
  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1, mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t(title)}</Typography>
        {note && <Typography variant="caption" color="text.secondary">{t(note)}</Typography>}
      </Stack>
      {children}
    </Box>
  )
}

const APP_FIELDS: [CopyKey, string][] = [
  ['application.field.clientName', 'client_name'], ['application.field.clientPhone', 'client_phone'], ['application.field.clientBirth', 'client_birth'],
  ['application.field.residence', 'residence'], ['application.field.school', 'school'], ['application.field.guardianName', 'guardian_name'],
  ['application.field.guardianPhone', 'guardian_phone'], ['application.field.testName', 'test_name'], ['application.field.counselField', 'counsel_field'],
  ['application.field.preferredMethod', 'preferred_method'], ['application.field.preferredSchedule', 'preferred_schedule'], ['application.field.reason', 'reason'],
  ['application.field.expectation', 'expectation'], ['application.field.counselingExperience', 'counseling_experience'], ['application.field.requestNote', 'request_note'],
]

const PURCHASE_FIELDS: [CopyKey, 'product_name' | 'test_option' | 'counsel_option' | 'purchase_memo' | 'admin_memo'][] = [
  ['purchase.field.productName', 'product_name'], ['purchase.field.testOption', 'test_option'], ['purchase.field.counselOption', 'counsel_option'],
  ['purchase.field.purchaseMemo', 'purchase_memo'], ['purchase.field.adminMemo', 'admin_memo'],
]

const yesNo = (v: unknown) => t(v ? 'application.yes' : 'application.no')
const when = (v: string | null | undefined) => (v ? formatKstDateTime(v) : null)
const count = (n: number | null | undefined) => (n === null || n === undefined ? null : String(n))

export function ApplicationTab({ d }: { d: PurchaseDetail }) {
  const a = d.application
  return (
    <Stack spacing={2}>
      <Section title="purchaseForm.application">
        {!a && <Typography variant="body2" color="text.secondary">{t('application.none')}</Typography>}
        {a && (
          <>
            <Row label="application.field.submittedAt" value={typeof a.submitted_at === 'string' ? formatKstDateTime(a.submitted_at) : null} />
            {APP_FIELDS.map(([label, key]) => <Row key={key} label={label} value={a[key] as string | null} />)}
            <Row label="application.field.consent" value={yesNo(a.consent_third_party)} />
            <Row label="application.field.refund" value={yesNo(a.refund_policy_checked)} />
            {d.answers && (
              <Row label="application.template" value={t('application.templateValue', { name: d.answers.template_name, n: d.answers.template_version })} />
            )}
          </>
        )}
      </Section>
      {d.answers && d.answers.extra.length > 0 && (
        <Section title="application.answers" note="application.answersNote">
          {d.answers.extra.map((x) => <AnswerRow key={x.id} label={x.label} value={x.value} />)}
        </Section>
      )}
      {a && (
        <>
          <Divider />
          <Box>
            <Alert severity="warning" sx={{ mb: 1 }}>{t('application.sensitiveNote')}</Alert>
            <Row label="application.field.medication" value={d.sensitive?.medication_diagnosis} />
            <Row label="application.field.resultFile" value={d.sensitive?.result_file_url} />
            {(d.sensitive?.extra ?? []).map((x) => <AnswerRow key={x.id} label={x.label} value={x.value} />)}
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">{t('application.marketingNote')}</Typography>
            <Row label="application.field.referral" value={d.marketing?.referral_source} />
          </Box>
        </>
      )}
    </Stack>
  )
}

function PurchaseInfo({ d }: { d: PurchaseDetail }) {
  return (
    <Section title="purchaseForm.purchase">
      <Row label="purchase.field.type" value={purchaseTypeLabel(d.purchase.purchase_type)} />
      <Row label="purchase.field.paidAt" value={when(d.purchase.paid_at)} />
      {PURCHASE_FIELDS.filter(([, key]) => d.purchase[key]).map(([label, key]) => <Row key={key} label={label} value={d.purchase[key]} />)}
    </Section>
  )
}

// 주문 정보 탭: 구매 정보는 늘 보이고, 네이버 칸은 네이버 주문일 때만 이어서 보인다
export function OrderTab({ d, showSettlement }: { d: PurchaseDetail; showSettlement: boolean }) {
  const n = d.naver
  if (!n || !n.last_received_at) {
    return (
      <Stack spacing={2}>
        <PurchaseInfo d={d} />
        {!n && <Typography variant="body2" color="text.secondary">{t('naver.none')}</Typography>}
        {n && (
          <>
            <Alert severity="info">{t('naver.onlyId')}</Alert>
            <Row label="naver.field.productOrderId" value={n.naver_product_order_id} />
          </>
        )}
      </Stack>
    )
  }
  const s = d.settlement
  return (
    <Stack spacing={2}>
      <PurchaseInfo d={d} />
      <Divider />
      <Section title="naver.section.order">
        <Row label="naver.field.productOrderId" value={n.naver_product_order_id} />
        <Row label="naver.field.orderId" value={n.external_order_id} />
        <Row label="naver.field.orderedAt" value={when(n.ordered_at)} />
        <Row label="naver.field.inflowPath" value={n.inflow_path} />
      </Section>
      <Divider />
      <Section title="naver.section.product">
        <Row label="naver.field.option" value={n.option_name} />
        <Row label="naver.field.productId" value={n.naver_product_id} />
        <Row label="naver.field.originalProductId" value={n.original_product_id} />
        <Row label="naver.field.itemNo" value={n.item_no} />
        <Row label="naver.field.sellerProductCode" value={n.seller_product_code} />
      </Section>
      <Divider />
      <Section title="naver.section.amount">
        <Row label="naver.field.quantity" value={count(n.quantity)} />
        <Row label="naver.field.remainQuantity" value={count(n.remain_quantity)} />
        <Row label="naver.field.paymentAmount" value={won(n.payment_amount)} />
        <Row label="naver.field.remainPaymentAmount" value={won(n.remain_payment_amount)} />
      </Section>
      <Divider />
      <Section title="naver.section.status">
        <Row label="naver.field.orderStatus" value={naverCodeLabel('orderStatus', n.product_order_status)} />
        <Row label="naver.field.placeOrder" value={naverCodeLabel('placeOrder', n.place_order_status)} />
        <Row label="naver.field.decidedAt" value={when(n.decided_at)} />
        <Row label="naver.field.gift" value={naverCodeLabel('gift', n.gift_receiving_status)} />
        <Row label="naver.field.closedAt" value={when(n.closed_at)} />
        <Row label="naver.field.lastReceivedAt" value={when(n.last_received_at)} />
      </Section>
      {n.claim_type && (
        <>
          <Divider />
          <Section title="naver.section.claim">
            <Row label="naver.field.claimType" value={naverCodeLabel('claimType', n.claim_type)} />
            <Row label="naver.field.claimStatus" value={naverCodeLabel('claimStatus', n.claim_status)} />
            <Row label="naver.field.claimRequestedAt" value={when(n.claim_requested_at)} />
          </Section>
        </>
      )}
      <Divider />
      <Section title="naver.section.orderer" note="naver.ordererNote">
        {d.orderer
          ? (
            <>
              <Row label="naver.field.ordererName" value={d.orderer.name_masked} />
              <Row label="naver.field.ordererTel" value={d.orderer.tel_masked} />
            </>
          )
          : <Typography variant="body2" color="text.secondary">{t('naver.ordererNone')}</Typography>}
      </Section>
      {showSettlement && s && (
        <>
          <Divider />
          <Section title="naver.section.settlement" note="naver.settlementNote">
            <Row label="naver.field.expectedSettlement" value={won(s.expected_settlement_amount)} />
            <Row label="naver.field.paymentCommission" value={won(s.payment_commission)} />
            <Row label="naver.field.channelCommission" value={won(s.channel_commission)} />
            <Row label="naver.field.saleCommission" value={won(s.sale_commission)} />
            <Row label="naver.field.interlockCommission" value={won(s.shopping_interlock_commission)} />
          </Section>
        </>
      )}
    </Stack>
  )
}
