import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from '@mui/material'
import { formatKstDateTime } from '@seorap-core/time.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { purchaseTypeLabel } from '@counsel-core/purchases.ts'
import { getApplicationDetail, type ApplicationDetail } from '../lib/api'
import { Loading } from './PageState'

function Row({ label, value }: { label: CopyKey; value: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '150px 1fr' }, gap: { xs: 0.25, sm: 2 }, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">{t(label)}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{value === null || value === undefined || value === '' ? t('center.empty') : value}</Typography>
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

const PURCHASE_FIELDS: [CopyKey, Exclude<keyof ApplicationDetail['purchase'], 'purchase_type'>][] = [
  ['purchase.field.orderNo', 'order_no'], ['purchase.field.productName', 'product_name'], ['purchase.field.testOption', 'test_option'],
  ['purchase.field.counselOption', 'counsel_option'], ['purchase.field.paidOn', 'paid_on'], ['purchase.field.purchaseMemo', 'purchase_memo'],
  ['purchase.field.adminMemo', 'admin_memo'],
]

const yesNo = (v: unknown) => t(v ? 'application.yes' : 'application.no')

// 신청서 읽기 전용 창. 배정할 센터를 고를 때 대상·지역·희망 일정을 확인하는 용도라 신청서를 먼저 보이고, 구매 정보는 채워진 칸만 보인다.
export default function ApplicationDialog({ purchaseId, onClose }: { purchaseId: string | null; onClose: () => void }) {
  // 응답이 어느 구매 건 것인지 함께 둔다. 다른 건을 열면 이전 내용 대신 불러오는 중이 보인다.
  const [loaded, setLoaded] = useState<{ id: string; detail?: ApplicationDetail; error?: CounselError } | null>(null)

  useEffect(() => {
    if (!purchaseId) return
    getApplicationDetail(purchaseId).then(
      (detail) => setLoaded({ id: purchaseId, detail }),
      (e: unknown) => setLoaded({ id: purchaseId, error: toCounselError(e) }),
    )
  }, [purchaseId])

  const current = loaded?.id === purchaseId ? loaded : null
  const detail = current?.detail ?? null
  const error = current?.error ?? null
  const a = detail?.application
  return (
    <Dialog open={!!purchaseId} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('purchases.viewApplication')}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error">{errorText(error)}</Alert>}
        {!detail && !error && <Loading />}
        {detail && (
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>{t('purchaseForm.application')}</Typography>
              {!a && <Typography variant="body2" color="text.secondary">{t('application.none')}</Typography>}
              {a && (
                <>
                  <Row label="application.field.submittedAt" value={typeof a.submitted_at === 'string' ? formatKstDateTime(a.submitted_at) : null} />
                  {APP_FIELDS.map(([label, key]) => <Row key={key} label={label} value={a[key] as string | null} />)}
                  <Row label="application.field.consent" value={yesNo(a.consent_third_party)} />
                  <Row label="application.field.refund" value={yesNo(a.refund_policy_checked)} />
                </>
              )}
            </Box>
            <Divider />
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>{t('purchaseForm.purchase')}</Typography>
              <Row label="purchase.field.type" value={purchaseTypeLabel(detail.purchase.purchase_type)} />
              {PURCHASE_FIELDS.filter(([, key]) => detail.purchase[key]).map(([label, key]) => <Row key={key} label={label} value={detail.purchase[key]} />)}
            </Box>
            {a && (
              <>
                <Divider />
                <Box>
                  <Alert severity="warning" sx={{ mb: 1 }}>{t('application.sensitiveNote')}</Alert>
                  <Row label="application.field.medication" value={detail.sensitive?.medication_diagnosis} />
                  <Row label="application.field.resultFile" value={detail.sensitive?.result_file_url} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('application.marketingNote')}</Typography>
                  <Row label="application.field.referral" value={detail.marketing?.referral_source} />
                </Box>
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('application.close')}</Button></DialogActions>
    </Dialog>
  )
}
