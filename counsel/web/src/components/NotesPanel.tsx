import { useState } from 'react'
import { Alert, Box, Button, Divider, Stack, TextField, Typography } from '@mui/material'
import { formatKstDateTime } from '@seorap-core/time.ts'
import { t } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { addPurchaseNote, type PurchaseNote } from '../lib/api'

type Props = {
  purchaseId: string
  notes: PurchaseNote[]
  names: Record<string, string>
  canWrite: boolean
  onChanged: (message: string) => Promise<void>
}

// 건 메모. 누가 언제 남겼는지 함께 보이고, 남긴 메모는 고치거나 지우지 못한다.
export default function NotesPanel({ purchaseId, notes, names, canWrite, onChanged }: Props) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<CounselError | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await addPurchaseNote(purchaseId, body)
      await onChanged(t('notes.added'))
      setBody('')
    } catch (e) {
      setError(toCounselError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('notes.title')}</Typography>
      {canWrite && (
        <Stack spacing={1}>
          {error && <Alert severity="error">{errorText(error)}</Alert>}
          <TextField multiline minRows={2} placeholder={t('notes.placeholder')} value={body} onChange={(e) => setBody(e.target.value)}
            helperText={`${t('notes.appendOnly')} · ${t('notes.count', { n: body.length })}`} slotProps={{ htmlInput: { maxLength: 1000 } }} />
          <Box>
            <Button variant="contained" size="small" disabled={busy || !body.trim()} onClick={() => void submit()}>{t('notes.add')}</Button>
          </Box>
        </Stack>
      )}
      {notes.length === 0 && <Typography variant="body2" color="text.secondary">{t('notes.empty')}</Typography>}
      {notes.map((n, i) => (
        <Box key={n.id}>
          {i > 0 && <Divider sx={{ mb: 1.5 }} />}
          <Typography variant="caption" color="text.secondary">
            {[formatKstDateTime(n.created_at), n.author ? names[n.author] : null].filter(Boolean).join(' · ')}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>{n.body}</Typography>
        </Box>
      ))}
    </Stack>
  )
}
