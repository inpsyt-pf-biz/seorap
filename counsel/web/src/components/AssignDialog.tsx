import { useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { locationLabel, targetsLabel, type Center } from '@counsel-core/centers.ts'
import { t } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { assignSessions } from '../lib/api'

type Props = {
  open: boolean
  sessionIds: string[]
  centers: Center[]
  onClose: () => void
  onDone: (message: string) => void
}

// 선택한 상담 줄을 한 센터에 배정한다. 운영 중인 센터만 고를 수 있다(DB 함수도 같은 규칙으로 막는다).
export default function AssignDialog({ open, sessionIds, centers, onClose, onDone }: Props) {
  const [centerId, setCenterId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<CounselError | null>(null)
  const active = centers.filter((c) => c.status === 'active')

  const submit = async () => {
    const center = centers.find((c) => c.id === centerId)
    if (!center) return
    setSaving(true)
    setError(null)
    try {
      const r = await assignSessions(sessionIds, centerId, note)
      onDone(r.skipped > 0
        ? t('assign.doneSkipped', { n: r.assigned, center: center.name, m: r.skipped })
        : t('assign.done', { n: r.assigned, center: center.name }))
      setCenterId('')
      setNote('')
    } catch (e) {
      setError(toCounselError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('assign.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">{t('assign.help', { n: sessionIds.length })}</Typography>
          {error && <Alert severity="error">{errorText(error)}</Alert>}
          <TextField select label={t('assign.center')} value={centerId} onChange={(e) => setCenterId(e.target.value)} helperText={t('assign.onlyActive')}>
            {active.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                <Stack>
                  <Typography variant="body1">{c.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[locationLabel(c.location_sido, c.location_sigungu), targetsLabel(c.target_groups), t('assign.centerProgress', { done: c.completed_count ?? 0, assigned: c.assigned_count ?? 0 })].join(' · ')}
                  </Typography>
                </Stack>
              </MenuItem>
            ))}
          </TextField>
          <TextField label={t('assign.note')} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 500 } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t('assign.cancel')}</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={!centerId || saving}>{t('assign.submit')}</Button>
      </DialogActions>
    </Dialog>
  )
}
