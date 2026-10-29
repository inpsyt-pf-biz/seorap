import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import { formatKstDateTime } from '@seorap-core/time.ts'
import { t } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { emptyDefinition, type FormTemplateRow } from '@counsel-core/forms.ts'
import { ErrorBox, Loading } from '../../../components/PageState'
import { createFormTemplate, listFormTemplates } from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'

// 신청서 템플릿 목록 (서랍 B2). 템플릿을 고쳐 게시하면 연결된 상품 구매자의 서랍에 새 판이 보인다
export default function FormsListPage() {
  const { state } = useSession()
  const navigate = useNavigate()
  const canManage = hasCap(state, 'form.manage')
  const [rows, setRows] = useState<FormTemplateRow[] | null>(null)
  const [error, setError] = useState<CounselError | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { listFormTemplates().then(setRows, (e: unknown) => setError(toCounselError(e))) }, [])

  const create = async () => {
    setBusy(true)
    try { navigate(`/admin/counsel/forms/${await createFormTemplate(name.trim(), emptyDefinition())}`) }
    catch (e) { setError(toCounselError(e)); setBusy(false) }
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="h5">{t('forms.title')}</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="outlined" onClick={() => navigate('/admin/counsel/forms/links')}>{t('forms.links')}</Button>
        {canManage && <Button variant="contained" onClick={() => setCreating(true)}>{t('forms.create')}</Button>}
      </Stack>
      {error && <ErrorBox message={errorText(error)} />}
      {!rows && !error && <Loading />}
      {rows && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('forms.col.name')}</TableCell>
                <TableCell>{t('forms.col.published')}</TableCell>
                <TableCell>{t('forms.col.links')}</TableCell>
                <TableCell>{t('forms.col.updated')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">{t('forms.empty')}</Typography></TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/counsel/forms/${r.id}`)}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.published_version ? t('forms.publishedVersion', { n: r.published_version }) : t('forms.notPublished')}</TableCell>
                  <TableCell>{t('forms.linkCount', { n: r.link_count })}</TableCell>
                  <TableCell>{formatKstDateTime(r.updated_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={creating} onClose={() => setCreating(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('forms.create')}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label={t('forms.createName')} value={name} onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 100 } }} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>{t('form.cancel')}</Button>
          <Button variant="contained" disabled={busy || !name.trim()} onClick={create}>{t('forms.create')}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
