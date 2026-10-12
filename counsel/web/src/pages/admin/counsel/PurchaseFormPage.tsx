import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import {
  APPLICATION_LIMITS, EMPTY_PURCHASE_INPUT, PURCHASE_TYPES, overLimitFields, purchaseTypeLabel, validatePurchaseInput,
  type ApplicationInput, type PurchaseInput, type PurchaseInputErrors, type PurchaseType,
} from '@counsel-core/purchases.ts'
import { createPurchase } from '../../../lib/api'

type TextKey = Exclude<keyof ApplicationInput, 'submitted_at' | 'consent_third_party' | 'refund_policy_checked'>
type Field = { key: TextKey; label: CopyKey; multiline?: boolean; wide?: boolean }

// 신청서 칸 배치. 구글폼 4종에 공통으로 있는 칸 위주이고, 빠진 칸은 비워 둬도 된다.
const APPLICATION_FIELDS: Field[] = [
  { key: 'client_name', label: 'application.field.clientName' },
  { key: 'client_phone', label: 'application.field.clientPhone' },
  { key: 'client_birth', label: 'application.field.clientBirth' },
  { key: 'guardian_name', label: 'application.field.guardianName' },
  { key: 'guardian_phone', label: 'application.field.guardianPhone' },
  { key: 'residence', label: 'application.field.residence' },
  { key: 'school', label: 'application.field.school' },
  { key: 'test_name', label: 'application.field.testName' },
  { key: 'counsel_field', label: 'application.field.counselField' },
  { key: 'preferred_method', label: 'application.field.preferredMethod' },
  { key: 'preferred_schedule', label: 'application.field.preferredSchedule', wide: true },
  { key: 'reason', label: 'application.field.reason', multiline: true, wide: true },
  { key: 'expectation', label: 'application.field.expectation', multiline: true, wide: true },
  { key: 'counseling_experience', label: 'application.field.counselingExperience', wide: true },
  { key: 'request_note', label: 'application.field.requestNote', multiline: true, wide: true },
]

const PURCHASE_TEXT: { key: 'product_name' | 'test_option' | 'counsel_option'; label: CopyKey }[] = [
  { key: 'product_name', label: 'purchase.field.productName' },
  { key: 'test_option', label: 'purchase.field.testOption' },
  { key: 'counsel_option', label: 'purchase.field.counselOption' },
]

const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 } as const

export default function PurchaseFormPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState<PurchaseInput>(EMPTY_PURCHASE_INPUT)
  const [fieldErrors, setFieldErrors] = useState<PurchaseInputErrors>({})
  const [orderDuplicate, setOrderDuplicate] = useState(false)
  const [error, setError] = useState<CounselError | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (patch: Partial<PurchaseInput>) => setValues((v) => ({ ...v, ...patch }))
  const setApp = (patch: Partial<ApplicationInput>) => setValues((v) => ({ ...v, application: { ...v.application, ...patch } }))
  const tooLong = new Set(fieldErrors.application ? overLimitFields(values.application) : [])

  const appField = (f: Field) => {
    const limit = APPLICATION_LIMITS[f.key]
    const over = tooLong.has(f.key)
    const nameError = f.key === 'client_name' && fieldErrors.client_name ? t(fieldErrors.client_name) : undefined
    return (
      <TextField key={f.key} label={t(f.label)} value={values.application[f.key]} onChange={(e) => setApp({ [f.key]: e.target.value })}
        multiline={f.multiline} minRows={f.multiline ? 3 : undefined} sx={f.wide ? { gridColumn: { md: '1 / -1' } } : undefined}
        error={over || !!nameError} helperText={nameError ?? (over && limit ? t('purchase.error.fieldTooLong', { n: limit }) : undefined)}
        slotProps={{ htmlInput: { maxLength: limit } }} />
    )
  }

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    const found = validatePurchaseInput(values)
    setFieldErrors(found)
    setOrderDuplicate(false)
    setError(null)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await createPurchase(values)
      navigate('/admin/counsel/purchases', { replace: true, state: { toast: t('purchaseForm.created') } })
    } catch (e) {
      const ce = toCounselError(e)
      if (ce.code === 'DUPLICATE_ORDER') setOrderDuplicate(true)
      else setError(ce)
    } finally {
      setSaving(false)
    }
  }

  const orderError = orderDuplicate ? t('error.DUPLICATE_ORDER') : fieldErrors.naver_product_order_id ? t(fieldErrors.naver_product_order_id) : undefined

  return (
    <Stack spacing={2} component="form" onSubmit={onSubmit} noValidate>
      <Typography variant="h5">{t('purchaseForm.title')}</Typography>
      {error && <Alert severity="error">{errorText(error)}</Alert>}
      {fieldErrors.application && <Alert severity="error">{t(fieldErrors.application)}</Alert>}

      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('purchaseForm.purchase')}</Typography>
          <Box sx={grid}>
            <TextField select label={t('purchase.field.type')} value={values.purchase_type} onChange={(e) => set({ purchase_type: e.target.value as PurchaseType })}>
              {PURCHASE_TYPES.map((p) => <MenuItem key={p} value={p}>{purchaseTypeLabel(p)}</MenuItem>)}
            </TextField>
            <TextField label={t('purchase.field.naverProductOrderId')} value={values.naver_product_order_id} onChange={(e) => set({ naver_product_order_id: e.target.value })}
              error={!!orderError} helperText={orderError ?? t('purchaseForm.orderHelp')} slotProps={{ htmlInput: { maxLength: 40, inputMode: 'numeric' } }} />
            {PURCHASE_TEXT.map((f) => (
              <TextField key={f.key} label={t(f.label)} value={values[f.key]} onChange={(e) => set({ [f.key]: e.target.value })}
                slotProps={{ htmlInput: { maxLength: 200 } }} />
            ))}
            <TextField type="date" label={t('purchase.field.paidOn')} value={values.paid_on} onChange={(e) => set({ paid_on: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label={t('purchase.field.purchaseMemo')} value={values.purchase_memo} onChange={(e) => set({ purchase_memo: e.target.value })}
              multiline minRows={2} slotProps={{ htmlInput: { maxLength: 1000 } }} />
            <TextField label={t('purchase.field.adminMemo')} value={values.admin_memo} onChange={(e) => set({ admin_memo: e.target.value })}
              multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} />
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
            <Typography variant="h6">{t('purchaseForm.application')}</Typography>
            <FormControlLabel label={t('purchaseForm.withApplication')}
              control={<Checkbox checked={values.with_application} onChange={(e) => set({ with_application: e.target.checked })} />} />
          </Stack>
          {values.with_application && (
            <>
              <Box sx={grid}>{APPLICATION_FIELDS.map(appField)}</Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2 }}>
                <FormControlLabel label={t('application.field.consent')} control={
                  <Checkbox checked={values.application.consent_third_party} onChange={(e) => setApp({ consent_third_party: e.target.checked })} />} />
                <FormControlLabel label={t('application.field.refund')} control={
                  <Checkbox checked={values.application.refund_policy_checked} onChange={(e) => setApp({ refund_policy_checked: e.target.checked })} />} />
              </Stack>
              <Alert severity="warning">{t('application.sensitiveNote')}</Alert>
              <Box sx={grid}>
                {appField({ key: 'medication_diagnosis', label: 'application.field.medication', multiline: true })}
                {appField({ key: 'result_file_url', label: 'application.field.resultFile' })}
              </Box>
              <Typography variant="caption" color="text.secondary">{t('application.marketingNote')}</Typography>
              <Box sx={grid}>{appField({ key: 'referral_source', label: 'application.field.referral' })}</Box>
            </>
          )}
        </Stack>
      </Paper>

      <Stack direction="row" sx={{ justifyContent: 'flex-end', gap: 1 }}>
        <Button onClick={() => navigate('/admin/counsel/purchases')} disabled={saving}>{t('purchaseForm.cancel')}</Button>
        <Button type="submit" variant="contained" disabled={saving}>{t('purchaseForm.save')}</Button>
      </Stack>
    </Stack>
  )
}
