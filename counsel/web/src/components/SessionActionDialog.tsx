import { useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { formatKstDateTime } from '@seorap-core/time.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import {
  NEEDS_REASON, NEEDS_SCHEDULE, SESSION_METHODS, actionLabel, kstLocalToIso, methodLabel, validateSessionAction,
  type SessionAction, type SessionActionErrors, type SessionMethod,
} from '@counsel-core/sessions.ts'
import { updateSession, type SessionDetail } from '../lib/api'

type Props = {
  session: SessionDetail
  action: SessionAction
  onClose: () => void
  // 저장한 뒤 상세를 다시 읽는다. 다 읽을 때까지 버튼을 막아 같은 일을 두 번 보내지 않는다
  onDone: (message: string) => Promise<void>
}

const toLocal = (iso: string | null) => (iso ? formatKstDateTime(iso).replace(' ', 'T') : '')

// 상담 한 회차의 진행을 바꾸는 창. 예약 확정·변경은 예약 일시를, 변경·불가·취소는 사유를 받는다.
export default function SessionActionDialog({ session, action, onClose, onDone }: Props) {
  const needsSchedule = NEEDS_SCHEDULE.includes(action)
  const needsReason = NEEDS_REASON.includes(action)
  const [scheduledAt, setScheduledAt] = useState(action === 'reschedule' ? toLocal(session.scheduled_at) : '')
  const [method, setMethod] = useState<SessionMethod | ''>(session.method === 'offline' || session.method === 'online' ? session.method : '')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<SessionActionErrors>({})
  const [error, setError] = useState<CounselError | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const found = validateSessionAction({ action, scheduledAt, method, reason })
    setErrors(found)
    setError(null)
    if (Object.keys(found).length > 0) return
    setBusy(true)
    try {
      await updateSession(session.id, session.version, action, needsSchedule ? kstLocalToIso(scheduledAt) : null, needsSchedule ? method || null : null, reason)
      await onDone(t('session.done', { action: actionLabel(action) }))
    } catch (e) {
      setError(toCounselError(e))
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('session.dialog.title', { action: actionLabel(action), n: session.seq })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">{t(`session.help.${action}` as CopyKey)}</Typography>
          {error && <Alert severity="error">{errorText(error)}</Alert>}
          {needsSchedule && (
            <>
              <TextField type="datetime-local" label={t('session.field.scheduledAt')} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                error={!!errors.scheduledAt} helperText={errors.scheduledAt ? t(errors.scheduledAt) : undefined} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField select label={t('session.dialog.method')} value={method} onChange={(e) => setMethod(e.target.value as SessionMethod | '')}>
                <MenuItem value="">{t('session.dialog.methodNone')}</MenuItem>
                {SESSION_METHODS.map((m) => <MenuItem key={m} value={m}>{methodLabel(m)}</MenuItem>)}
              </TextField>
            </>
          )}
          <TextField label={t(needsReason ? 'session.dialog.reason' : 'session.dialog.note')} value={reason} onChange={(e) => setReason(e.target.value)}
            required={needsReason} multiline minRows={2} error={!!errors.reason} helperText={errors.reason ? t(errors.reason) : undefined}
            slotProps={{ htmlInput: { maxLength: 500 } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{t('session.dialog.close')}</Button>
        <Button variant="contained" color={action === 'cancel' || action === 'unable' ? 'error' : 'primary'} disabled={busy} onClick={() => void submit()}>
          {actionLabel(action)}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
