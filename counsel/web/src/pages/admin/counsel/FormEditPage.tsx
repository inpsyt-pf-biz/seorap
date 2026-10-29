import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton, MenuItem, Paper, Snackbar, Stack, Switch,
  TextField, Tooltip, Typography,
} from '@mui/material'
import CounselForm from '@seorap-web/components/CounselForm'
import { tokens as seorapTokens } from '@seorap-web/theme/seorap'
import {
  type Answers, type AvailabilityConfig, type AvailabilityLabel, type FieldType, type FormDefinition, type FormField,
  DEFAULT_AVAILABILITY, checkDefinition, takesAnswer,
} from '@seorap-core/counselForm.ts'
import { t as seorapT } from '@seorap-core/copy.ko.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { toCounselError, type CounselError } from '@counsel-core/errors.ts'
import {
  FIELD_TYPES, STANDARD_FIELDS, fieldTypeLabel, formErrorText, moveField, newField, nextRowId, standardFieldLabel, tidyDefinition,
  type FormTemplateDetail,
} from '@counsel-core/forms.ts'
import { ErrorBox, Loading } from '../../../components/PageState'
import { duplicateFormTemplate, getFormTemplate, publishFormTemplate, saveFormDraft } from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'

const CONSENT_KINDS = ['third_party', 'sensitive', 'other'] as const

// 가능 시간대 문항의 요일·시간대·상담 방식·연락 시간과 그 질문 문구. 문구를 비우면 서랍 기본 문구가 보인다
function AvailabilityEditor({ a, readOnly, onChange }: {
  a: AvailabilityConfig; readOnly: boolean; onChange: (next: AvailabilityConfig) => void
}) {
  const set = (patch: Partial<AvailabilityConfig>) => onChange({ ...a, ...patch })
  const labelField = (k: AvailabilityLabel) => (
    <TextField size="small" label={t(`forms.edit.avail.${k}` as CopyKey)} value={a.labels?.[k] ?? ''} placeholder={seorapT(`form.avail.${k}`)}
      helperText={t('forms.edit.avail.defaultHint')} disabled={readOnly} slotProps={{ inputLabel: { shrink: true } }}
      onChange={(e) => set({ labels: { ...a.labels, [k]: e.target.value } })} />
  )
  const listField = (key: 'methods' | 'contactTimes') => (
    <TextField size="small" label={t(`forms.edit.avail.${key}` as CopyKey)} value={a[key].join('\n')} disabled={readOnly} multiline minRows={2}
      onChange={(e) => set({ [key]: e.target.value.split('\n') })} />
  )
  const removeButton = (disabled: boolean, onClick: () => void) => !readOnly && (
    <Button size="small" color="error" disabled={disabled} onClick={onClick}>{t('forms.edit.avail.removeRow')}</Button>
  )
  return (
    <Stack spacing={1.5} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
      <Typography variant="subtitle2">{t('forms.edit.avail.title')}</Typography>
      {labelField('pick')}
      <Typography variant="body2">{t('forms.edit.avail.days')}</Typography>
      {a.days.map((d, i) => (
        <Stack key={d.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField size="small" label={t('forms.edit.avail.day')} value={d.label} disabled={readOnly} sx={{ flexGrow: 1 }}
            onChange={(e) => set({ days: a.days.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
          {removeButton(a.days.length <= 1, () => set({ days: a.days.filter((_, j) => j !== i) }))}
        </Stack>
      ))}
      {!readOnly && (
        <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => set({ days: [...a.days, { id: nextRowId('d', a.days), label: '' }] })}>
          {t('forms.edit.avail.addDay')}
        </Button>
      )}
      <Typography variant="body2">{t('forms.edit.avail.slots')}</Typography>
      {a.slots.map((s, i) => (
        <Stack key={s.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField size="small" label={t('forms.edit.avail.slotLabel')} value={s.label} disabled={readOnly} sx={{ flexGrow: 1 }}
            onChange={(e) => set({ slots: a.slots.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
          <TextField size="small" label={t('forms.edit.avail.slotHours')} value={s.hours} disabled={readOnly} sx={{ flexGrow: 1 }}
            onChange={(e) => set({ slots: a.slots.map((x, j) => (j === i ? { ...x, hours: e.target.value } : x)) })} />
          {removeButton(a.slots.length <= 1, () => set({ slots: a.slots.filter((_, j) => j !== i) }))}
        </Stack>
      ))}
      {!readOnly && (
        <Button size="small" sx={{ alignSelf: 'flex-start' }}
          onClick={() => set({ slots: [...a.slots, { id: nextRowId('s', a.slots), label: '', hours: '' }] })}>
          {t('forms.edit.avail.addSlot')}
        </Button>
      )}
      <FormControlLabel label={t('forms.edit.avail.askStart')} disabled={readOnly}
        control={<Switch checked={a.askStartDate} onChange={(e) => set({ askStartDate: e.target.checked })} />} />
      {a.askStartDate && labelField('start')}
      {labelField('method')}
      {listField('methods')}
      {labelField('contact')}
      {listField('contactTimes')}
    </Stack>
  )
}

function FieldCard({ f, index, count, readOnly, onChange, onMove, onRemove }: {
  f: FormField; index: number; count: number; readOnly: boolean
  onChange: (next: FormField) => void; onMove: (delta: -1 | 1) => void; onRemove: () => void
}) {
  const set = (patch: Partial<FormField>) => onChange({ ...f, ...patch })
  const input = takesAnswer(f)
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <Chip size="small" label={t(fieldTypeLabel(f.type))} />
          <Typography variant="caption" color="text.secondary">{f.id}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          {!readOnly && (
            <>
              <Tooltip title={t('forms.edit.up')}><span><IconButton size="small" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('forms.edit.up')}>↑</IconButton></span></Tooltip>
              <Tooltip title={t('forms.edit.down')}><span><IconButton size="small" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={t('forms.edit.down')}>↓</IconButton></span></Tooltip>
              <Button size="small" color="error" onClick={onRemove}>{t('forms.edit.remove')}</Button>
            </>
          )}
        </Stack>
        <TextField size="small" label={t('forms.edit.label')} value={f.label} disabled={readOnly} onChange={(e) => set({ label: e.target.value })} />
        <TextField size="small" label={t('forms.edit.help')} value={f.help ?? ''} disabled={readOnly} multiline minRows={1}
          onChange={(e) => set({ help: e.target.value })} />
        {(f.type === 'single' || f.type === 'multi') && (
          <TextField size="small" label={t('forms.edit.options')} value={(f.options ?? []).join('\n')} disabled={readOnly} multiline minRows={2}
            onChange={(e) => set({ options: e.target.value.split('\n') })} />
        )}
        {f.type === 'consent' && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField size="small" select label={t('forms.edit.consentKind')} value={f.consentKind ?? 'other'} disabled={readOnly} sx={{ minWidth: 160 }}
              onChange={(e) => set({ consentKind: e.target.value as FormField['consentKind'] })}>
              {CONSENT_KINDS.map((k) => <MenuItem key={k} value={k}>{t(`forms.edit.consent.${k}` as CopyKey)}</MenuItem>)}
            </TextField>
            <TextField size="small" label={t('forms.edit.consentOption')} value={f.options?.[0] ?? ''} disabled={readOnly} sx={{ flexGrow: 1 }}
              onChange={(e) => set({ options: e.target.value ? [e.target.value] : undefined })} />
          </Stack>
        )}
        {f.type === 'availability' && (
          <AvailabilityEditor a={f.availability ?? DEFAULT_AVAILABILITY} readOnly={readOnly} onChange={(availability) => set({ availability })} />
        )}
        {input && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
            <FormControlLabel label={t('forms.edit.required')} disabled={readOnly}
              control={<Switch checked={!!f.required} onChange={(e) => set({ required: e.target.checked })} />} />
            {f.type !== 'consent' && (
              <>
                <Tooltip title={t('forms.edit.sensitiveHelp')}>
                  <FormControlLabel label={t('forms.edit.sensitive')} disabled={readOnly}
                    control={<Switch checked={!!f.sensitive} onChange={(e) => set({ sensitive: e.target.checked })} />} />
                </Tooltip>
                <TextField size="small" select label={t('forms.edit.mapsTo')} value={f.mapsTo ?? ''} disabled={readOnly} sx={{ minWidth: 220 }}
                  onChange={(e) => set({ mapsTo: (e.target.value || null) as FormField['mapsTo'] })}>
                  <MenuItem value="">{t('forms.edit.mapsToNone')}</MenuItem>
                  {STANDARD_FIELDS.map((s) => <MenuItem key={s} value={s}>{t(standardFieldLabel(s))}</MenuItem>)}
                </TextField>
              </>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  )
}

// 신청서 템플릿 편집 (서랍 B2). 왼쪽에서 고치고 오른쪽에서 서랍과 같은 부품으로 미리 본다.
// [초안 저장]은 언제든, [게시]는 문제가 없을 때만. 게시한 판은 고치지 않고 다시 게시하면 새 판이 된다.
export default function FormEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { state } = useSession()
  const readOnly = !hasCap(state, 'form.manage')
  const [tpl, setTpl] = useState<FormTemplateDetail | null>(null)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState<FormDefinition | null>(null)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<CounselError | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  // 복제 창에 넣을 새 이름 (null 이면 창이 닫혀 있다)
  const [copyName, setCopyName] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [addType, setAddType] = useState<FieldType>('short')
  const [preview, setPreview] = useState<Answers>({})

  const apply = (d: FormTemplateDetail) => { setTpl(d); setName(d.name); setDraft(d.draft); setDirty(false) }
  useEffect(() => { getFormTemplate(id).then(apply, (e: unknown) => setError(toCounselError(e))) }, [id])

  const problems = useMemo(() => {
    if (!draft) return []
    const list: CopyKey[] = checkDefinition(tidyDefinition(draft)).map((p) => `forms.problem.${p.problem}` as CopyKey)
    if (draft.fields.length === 0) list.push('forms.problem.no_fields')
    return [...new Set(list)]
  }, [draft])

  if (error && !tpl) return <ErrorBox message={formErrorText(error)} />
  if (!tpl || !draft) return <Loading />

  const change = (next: FormDefinition) => { setDraft(next); setDirty(true) }
  const setField = (i: number, f: FormField) => change({ ...draft, fields: draft.fields.map((x, j) => (j === i ? f : x)) })

  const save = async (def: FormDefinition) => {
    const v = await saveFormDraft(id, tpl.version, name.trim(), def)
    setTpl({ ...tpl, name: name.trim(), draft: def, version: v }); setDraft(def); setDirty(false)
    return v
  }
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(toCounselError(e)) } finally { setBusy(false) }
  }
  const onSave = () => run(async () => { await save(draft); setToast(t('forms.edit.saved')) })
  const onDuplicate = async () => {
    if (!copyName?.trim()) return
    setBusy(true); setCopyError(null)
    try {
      const newId = await duplicateFormTemplate(id, copyName.trim())
      setCopyName(null)
      navigate(`/admin/counsel/forms/${newId}`)
    } catch (e) {
      const ce = toCounselError(e)
      setCopyError(formErrorText(ce))
    } finally { setBusy(false) }
  }
  const onPublish = () => run(async () => {
    setConfirm(false)
    // 게시는 저장된 초안을 굳히므로, 정리한 초안을 먼저 저장한다
    const v = await save(tidyDefinition(draft))
    const n = await publishFormTemplate(id, v)
    apply(await getFormTemplate(id))
    setToast(t('forms.edit.published', { n }))
  })

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button onClick={() => navigate('/admin/counsel/forms')}>←</Button>
        <TextField size="small" value={name} disabled={readOnly} onChange={(e) => { setName(e.target.value); setDirty(true) }}
          slotProps={{ htmlInput: { maxLength: 100, 'aria-label': t('forms.col.name') } }} sx={{ minWidth: 280 }} />
        <Chip label={tpl.published_version ? t('forms.publishedVersion', { n: tpl.published_version }) : t('forms.notPublished')} />
        {dirty && <Typography variant="caption" color="warning.main">{t('forms.edit.unsaved')}</Typography>}
        <Box sx={{ flexGrow: 1 }} />
        {!readOnly && (
          <>
            <Button variant="text" disabled={busy} onClick={() => { setCopyError(null); setCopyName(t('forms.copyName', { name: tpl.name })) }}>{t('forms.duplicate')}</Button>
            <Button variant="outlined" disabled={busy || !dirty} onClick={onSave}>{t('forms.edit.save')}</Button>
            <Button variant="contained" disabled={busy || problems.length > 0} onClick={() => setConfirm(true)}>{t('forms.edit.publish')}</Button>
          </>
        )}
      </Stack>
      {readOnly && <Alert severity="info">{t('forms.edit.readOnly')}</Alert>}
      {error && <ErrorBox message={formErrorText(error)} />}
      {problems.length > 0 && !readOnly && (
        <Alert severity="warning">
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{t('forms.edit.problems')}</Typography>
          {problems.map((p) => <Typography key={p} variant="body2">· {t(p)}</Typography>)}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 420px' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={2}>
          <TextField label={t('forms.edit.intro')} helperText={t('forms.edit.introHelp')} value={draft.intro} disabled={readOnly} multiline minRows={2}
            onChange={(e) => change({ ...draft, intro: e.target.value })} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('forms.edit.fields')}</Typography>
          {draft.fields.map((f, i) => (
            <FieldCard key={f.id} f={f} index={i} count={draft.fields.length} readOnly={readOnly}
              onChange={(next) => setField(i, next)}
              onMove={(delta) => change({ ...draft, fields: moveField(draft.fields, i, delta) })}
              onRemove={() => change({ ...draft, fields: draft.fields.filter((_, j) => j !== i) })} />
          ))}
          {!readOnly && (
            <Stack direction="row" spacing={1}>
              <TextField size="small" select value={addType} onChange={(e) => setAddType(e.target.value as FieldType)} sx={{ minWidth: 180 }}
                slotProps={{ htmlInput: { 'aria-label': t('forms.edit.add') } }}>
                {FIELD_TYPES.map((ft) => <MenuItem key={ft} value={ft}>{t(fieldTypeLabel(ft))}</MenuItem>)}
              </TextField>
              <Button variant="outlined" onClick={() => change({ ...draft, fields: [...draft.fields, newField(addType, draft.fields)] })}>
                {t('forms.edit.add')}
              </Button>
            </Stack>
          )}
        </Stack>

        <Box sx={{ position: { lg: 'sticky' }, top: 16 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>{t('forms.edit.preview')}</Typography>
          <Paper variant="outlined" sx={{ p: 2, maxHeight: { lg: 'calc(100vh - 120px)' }, overflowY: 'auto', bgcolor: seorapTokens.surface.page }}>
            <Paper sx={{ p: 2 }}>
              <CounselForm definition={draft} value={preview} onChange={setPreview} />
            </Paper>
          </Paper>
        </Box>
      </Box>

      <Dialog open={confirm} onClose={() => setConfirm(false)} fullWidth maxWidth="xs">
        <DialogContent><Typography>{t('forms.edit.publishConfirm', { n: (tpl.published_version ?? 0) + 1 })}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>{t('form.cancel')}</Button>
          <Button variant="contained" disabled={busy} onClick={onPublish}>{t('forms.edit.publish')}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={copyName !== null} onClose={() => setCopyName(null)} fullWidth maxWidth="xs">
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="h6">{t('forms.duplicateTitle')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('forms.duplicateHelp')}</Typography>
            {dirty && <Alert severity="warning">{t('forms.duplicateUnsaved')}</Alert>}
            <TextField autoFocus fullWidth label={t('forms.createName')} value={copyName ?? ''} onChange={(e) => setCopyName(e.target.value)}
              error={!!copyError} helperText={copyError ?? undefined} slotProps={{ htmlInput: { maxLength: 100 } }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyName(null)}>{t('form.cancel')}</Button>
          <Button variant="contained" disabled={busy || !copyName?.trim()} onClick={onDuplicate}>{t('forms.duplicate')}</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </Stack>
  )
}
