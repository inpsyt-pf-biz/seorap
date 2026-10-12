import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, Paper, Stack,
  TextField, Typography,
} from '@mui/material'
import { t } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { listCounselors, saveCounselor, type Counselor } from '../lib/api'
import { ErrorBox, Loading } from './PageState'

type Editing = { id: string | null; version: number; name: string; memo: string; active: boolean }
const EMPTY: Editing = { id: null, version: 1, name: '', memo: '', active: true }

// 센터 상세의 상담사 목록. 이름·메모·활동 여부만 둔다(연락처 같은 개인정보는 받지 않는다).
export default function CounselorsPanel({ centerId, canManage, onSaved }: { centerId: string; canManage: boolean; onSaved: (message: string) => void }) {
  const [rows, setRows] = useState<Counselor[] | null>(null)
  const [error, setError] = useState<CounselError | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [nameError, setNameError] = useState(false)
  const [saveError, setSaveError] = useState<CounselError | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => listCounselors(centerId).then(setRows, (e: unknown) => setError(toCounselError(e))), [centerId])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!editing) return
    const name = editing.name.trim()
    setNameError(!name || name.length > 30)
    if (!name || name.length > 30) return
    setBusy(true)
    setSaveError(null)
    try {
      await saveCounselor(centerId, { ...editing, name })
      await load()
      setEditing(null)
      onSaved(t('counselors.saved'))
    } catch (e) {
      setSaveError(toCounselError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Paper sx={{ px: 3, py: 2.5, borderRadius: 4 }}>
      <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('counselors.title')}</Typography>
        {canManage && <Button size="small" variant="outlined" onClick={() => { setEditing(EMPTY); setNameError(false); setSaveError(null) }}>{t('counselors.add')}</Button>}
      </Stack>
      <Typography variant="caption" color="text.secondary">{t('counselors.help')}</Typography>
      {error && <ErrorBox message={errorText(error)} />}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{t('counselors.empty')}</Typography>}
      {rows && rows.length > 0 && (
        <Stack sx={{ mt: 1 }}>
          {rows.map((c, i) => (
            <Box key={c.id}>
              {i > 0 && <Divider />}
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, py: 1.25 }}>
                <Typography variant="body1" sx={{ fontWeight: 600, minWidth: 80 }}>{c.name}</Typography>
                <Chip size="small" variant="outlined" color={c.active ? 'success' : 'default'} label={t(c.active ? 'counselors.active' : 'counselors.inactive')} />
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{c.memo}</Typography>
                {canManage && (
                  <Button size="small" onClick={() => { setEditing({ id: c.id, version: c.version, name: c.name, memo: c.memo ?? '', active: c.active }); setNameError(false); setSaveError(null) }}>
                    {t('counselors.edit')}
                  </Button>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
      <Dialog open={!!editing} onClose={busy ? undefined : () => setEditing(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t(editing?.id ? 'counselors.dialogEdit' : 'counselors.dialogNew')}</DialogTitle>
        {editing && (
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {saveError && <Alert severity="error">{errorText(saveError)}</Alert>}
              <TextField label={t('counselors.name')} required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                error={nameError} helperText={nameError ? t('counselors.nameRequired') : undefined} slotProps={{ htmlInput: { maxLength: 30 } }} />
              <TextField label={t('counselors.memo')} value={editing.memo} onChange={(e) => setEditing({ ...editing, memo: e.target.value })}
                multiline minRows={2} slotProps={{ htmlInput: { maxLength: 200 } }} />
              <FormControlLabel label={t('counselors.active')} control={
                <Checkbox checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />} />
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setEditing(null)} disabled={busy}>{t('counselors.cancel')}</Button>
          <Button variant="contained" onClick={() => void save()} disabled={busy}>{t('counselors.save')}</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
