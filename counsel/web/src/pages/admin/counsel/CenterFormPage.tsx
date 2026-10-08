import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Autocomplete, Box, Button, Checkbox, FormControl, FormControlLabel, FormGroup, FormLabel,
  MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material'
import {
  CENTER_STATUSES, COUNSELING_TYPES, DELIVERY_MODES, EMPTY_CENTER_INPUT, REGIONS,
  modeLabel, statusLabel, toInput, typeLabel, validateCenterInput,
  type CenterInput, type CenterInputErrors, type CenterStatus,
} from '@counsel-core/centers.ts'
import { t } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { ErrorBox, Loading } from '../../../components/PageState'
import { createCenter, getCenter, updateCenter } from '../../../lib/api'

function toggle(list: string[], value: string, on: boolean): string[] {
  return on ? [...list, value] : list.filter((v) => v !== value)
}

export default function CenterFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [values, setValues] = useState<CenterInput | null>(mode === 'create' ? EMPTY_CENTER_INPUT : null)
  const [version, setVersion] = useState(0)
  const [fieldErrors, setFieldErrors] = useState<CenterInputErrors>({})
  const [error, setError] = useState<CounselError | null>(null)
  const [loadError, setLoadError] = useState<CounselError | null>(null)
  const [saving, setSaving] = useState(false)

  // 수정 화면을 열 때, 그리고 "최신 내용 불러오기"를 누를 때 지금 DB 값으로 다시 채운다(입력 중이던 값은 버린다)
  const load = useCallback(() => {
    getCenter(id).then(
      (c) => { setValues(toInput(c)); setVersion(c.version); setError(null); setFieldErrors({}) },
      (e: unknown) => setLoadError(toCounselError(e)),
    )
  }, [id])
  useEffect(() => { if (mode === 'edit') load() }, [mode, load])

  if (loadError) return <ErrorBox message={errorText(loadError)} />
  if (!values) return <Loading />

  const set = (patch: Partial<CenterInput>) => setValues({ ...values, ...patch })
  const err = (k: keyof CenterInput) => (fieldErrors[k] ? t(fieldErrors[k]) : undefined)

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    const found = validateCenterInput(values)
    setFieldErrors(found)
    setError(null)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      if (mode === 'create') {
        const newId = await createCenter(values)
        navigate(`/admin/counsel/centers/${newId}`, { replace: true, state: { toast: t('form.created') } })
      } else {
        await updateCenter(id, version, values)
        navigate(`/admin/counsel/centers/${id}`, { replace: true, state: { toast: t('form.saved') } })
      }
    } catch (e) {
      const ce = toCounselError(e)
      if (ce.code === 'DUPLICATE_NAME') setFieldErrors({ name: 'error.DUPLICATE_NAME' })
      else setError(ce)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={2} component="form" onSubmit={onSubmit} noValidate>
      <Typography variant="h5">{t(mode === 'create' ? 'form.createTitle' : 'form.editTitle')}</Typography>

      {error && (
        <Alert severity={error.code === 'VERSION_CONFLICT' ? 'warning' : 'error'}
          action={error.code === 'VERSION_CONFLICT' ? <Button color="inherit" size="small" onClick={load}>{t('form.reload')}</Button> : undefined}>
          {errorText(error)}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <Stack spacing={3}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 2 }}>
            <TextField label={t('center.field.name')} required value={values.name} onChange={(e) => set({ name: e.target.value })}
              error={!!err('name')} helperText={err('name')} slotProps={{ htmlInput: { maxLength: 60 } }} />
            <TextField select label={t('center.field.status')} value={values.status} onChange={(e) => set({ status: e.target.value as CenterStatus })}>
              {CENTER_STATUSES.map((s) => <MenuItem key={s} value={s}>{statusLabel(s)}</MenuItem>)}
            </TextField>
          </Box>

          {/* 권역 칸에서 Enter 는 첫 번째 맞는 권역을 고른다. 양식 저장으로 넘어가지 않게 막는다. */}
          <Autocomplete multiple autoHighlight options={[...REGIONS]} value={values.regions} onChange={(_, v) => set({ regions: v })}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
            openText={t('form.picker.open')} closeText={t('form.picker.close')} clearText={t('form.picker.clear')} noOptionsText={t('form.picker.noRegion')}
            renderInput={(p) => <TextField {...p} label={t('center.field.regions')} />} />

          <FormControl component="fieldset">
            <FormLabel component="legend">{t('center.field.types')}</FormLabel>
            <FormGroup row>
              {COUNSELING_TYPES.map((v) => (
                <FormControlLabel key={v} label={typeLabel(v)} control={
                  <Checkbox checked={values.counseling_types.includes(v)} onChange={(e) => set({ counseling_types: toggle(values.counseling_types, v, e.target.checked) })} />
                } />
              ))}
            </FormGroup>
          </FormControl>

          <FormControl component="fieldset">
            <FormLabel component="legend">{t('center.field.modes')}</FormLabel>
            <FormGroup row>
              {DELIVERY_MODES.map((v) => (
                <FormControlLabel key={v} label={modeLabel(v)} control={
                  <Checkbox checked={values.delivery_modes.includes(v)} onChange={(e) => set({ delivery_modes: toggle(values.delivery_modes, v, e.target.checked) })} />
                } />
              ))}
            </FormGroup>
          </FormControl>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <TextField label={t('center.field.phone')} value={values.phone} onChange={(e) => set({ phone: e.target.value })}
              error={!!err('phone')} helperText={err('phone') ?? t('form.phoneHelp')} slotProps={{ htmlInput: { inputMode: 'tel' } }} />
            <TextField label={t('center.field.address')} value={values.address} onChange={(e) => set({ address: e.target.value })}
              error={!!err('address')} helperText={err('address')} />
            <TextField label={t('center.field.contactName')} value={values.contact_name} onChange={(e) => set({ contact_name: e.target.value })}
              error={!!err('contact_name')} helperText={err('contact_name')} />
            <TextField label={t('center.field.contactPhone')} value={values.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })}
              error={!!err('contact_phone')} helperText={err('contact_phone') ?? t('form.phoneHelp')} slotProps={{ htmlInput: { inputMode: 'tel' } }} />
            <TextField type="date" label={t('center.field.contractFrom')} value={values.contract_from} onChange={(e) => set({ contract_from: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField type="date" label={t('center.field.contractTo')} value={values.contract_to} onChange={(e) => set({ contract_to: e.target.value })}
              error={!!err('contract_to')} helperText={err('contract_to')} slotProps={{ inputLabel: { shrink: true } }} />
          </Box>

          <TextField label={t('center.field.memo')} multiline minRows={3} value={values.memo} onChange={(e) => set({ memo: e.target.value })}
            error={!!err('memo')} helperText={err('memo') ?? t('form.memoCount', { n: values.memo.length })} />
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button variant="outlined" onClick={() => navigate(-1)} disabled={saving}>{t('form.cancel')}</Button>
        <Button type="submit" variant="contained" disabled={saving}>{t('form.save')}</Button>
      </Stack>
    </Stack>
  )
}
