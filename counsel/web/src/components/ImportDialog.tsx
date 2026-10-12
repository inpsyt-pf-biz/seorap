import { useMemo, useState, type ChangeEvent } from 'react'
import {
  Alert, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { PURCHASE_TYPES, purchaseTypeLabel, type PurchaseType } from '@counsel-core/purchases.ts'
import { importPayload, previewImport } from '@counsel-core/sheetImport.ts'
import { importApplications } from '../lib/api'

const PREVIEW_ROWS = 20

// 구글폼 응답 시트(CSV)를 미리 보고 가져온다. 같은 줄을 다시 가져와도 한 건만 남는다(DB 가 응답 시각·연락처로 판정).
export default function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const [type, setType] = useState<PurchaseType>('test_main')
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState<string | null>(null)
  const [skipEnded, setSkipEnded] = useState(true)
  const [readFailed, setReadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<CounselError | null>(null)

  const preview = useMemo(() => (text === null ? null : previewImport(text, { skipEnded })), [text, skipEnded])
  const mappedCount = preview ? Object.keys(preview.mapping.columns).length : 0

  const reset = () => { setText(null); setFileName(''); setError(null); setReadFailed(false) }
  const close = () => { if (!saving) { reset(); onClose() } }

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    reset()
    try {
      setText(await f.text())
      setFileName(f.name)
    } catch {
      setReadFailed(true)
    }
  }

  const submit = async () => {
    if (!preview) return
    setSaving(true)
    setError(null)
    try {
      const r = await importApplications(type, importPayload(preview))
      onDone(r.duplicates > 0 ? t('import.doneDup', { inserted: r.inserted, dup: r.duplicates }) : t('import.done', { inserted: r.inserted }))
      reset()
    } catch (err) {
      setError(toCounselError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="lg">
      <DialogTitle>{t('import.title')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="warning">{t('import.warning')}</Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <TextField select size="small" label={t('import.type')} value={type} onChange={(e) => setType(e.target.value as PurchaseType)} sx={{ minWidth: 200 }}>
              {PURCHASE_TYPES.map((p) => <MenuItem key={p} value={p}>{purchaseTypeLabel(p)}</MenuItem>)}
            </TextField>
            <Button variant="outlined" component="label">
              {t('import.file')}
              <input hidden type="file" accept=".csv,text/csv" onChange={(e) => void pick(e)} />
            </Button>
            {fileName && <Typography variant="body2">{fileName}</Typography>}
          </Stack>
          <Typography variant="caption" color="text.secondary">{t('import.fileHelp')}</Typography>
          <FormControlLabel control={<Checkbox checked={skipEnded} onChange={(e) => setSkipEnded(e.target.checked)} />} label={t('import.skipEnded')} />
          {readFailed && <Alert severity="error">{t('import.readFailed')}</Alert>}
          {error && <Alert severity="error">{errorText(error)}{error.detail ? ` (${error.detail})` : ''}</Alert>}
          {preview && (
            <>
              <Typography variant="body2">{t('import.mapped', { n: mappedCount, total: preview.headerCount })}</Typography>
              {preview.mapping.ignored.length > 0 && (
                <Typography variant="caption" color="text.secondary">{t('import.ignored', { cols: preview.mapping.ignored.join(', ') })}</Typography>
              )}
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{t('import.counts', preview.counts)}</Typography>
              <Typography variant="caption" color="text.secondary">{t('import.previewTitle', { n: Math.min(PREVIEW_ROWS, preview.rows.length) })}</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {(['import.line', 'application.field.clientName', 'application.field.guardianName', 'application.field.clientPhone', 'application.field.testName', 'application.field.preferredSchedule'] as CopyKey[])
                      .map((k) => <TableCell key={k}>{k === 'import.line' ? '#' : t(k)}</TableCell>)}
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.rows.slice(0, PREVIEW_ROWS).map((r) => (
                    <TableRow key={r.line}>
                      <TableCell>{t('import.line', { n: r.line })}</TableCell>
                      <TableCell>{r.row.application.client_name}</TableCell>
                      <TableCell>{r.row.application.guardian_name}</TableCell>
                      <TableCell>{r.row.application.client_phone}</TableCell>
                      <TableCell>{r.row.application.test_name}</TableCell>
                      <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.row.application.preferred_schedule}</TableCell>
                      <TableCell>
                        <Chip size="small" label={t(`import.state.${r.state}` as CopyKey)} color={r.state === 'ok' ? 'success' : r.state === 'tooLong' ? 'error' : 'default'} variant="outlined" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={saving}>{t('import.close')}</Button>
        <Button variant="contained" disabled={!preview || preview.counts.ok === 0 || saving} onClick={() => void submit()}>
          {t('import.submit', { n: preview?.counts.ok ?? 0 })}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
