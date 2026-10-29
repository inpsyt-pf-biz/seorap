import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, MenuItem, Paper, Snackbar, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material'
import { t } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { MANAGE_CODE_RE, type FormLink, type FormTemplateRow } from '@counsel-core/forms.ts'
import { PURCHASE_TYPES, purchaseTypeLabel, type PurchaseType } from '@counsel-core/purchases.ts'
import { ErrorBox, Loading } from '../../../components/PageState'
import { listFormLinks, listFormTemplates, setFormLink } from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'

type Row = Omit<FormLink, 'flow'> & { isNew: boolean; dirty: boolean }

// 상품(관리코드) → 신청서 연결 (서랍 B2). 순서는 지금 "신청서 먼저"만 쓴다. "검사 먼저"는 자리만 보인다
export default function FormLinksPage() {
  const { state } = useSession()
  const navigate = useNavigate()
  const canManage = hasCap(state, 'form.manage')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [templates, setTemplates] = useState<FormTemplateRow[]>([])
  const [error, setError] = useState<CounselError | null>(null)
  const [rowError, setRowError] = useState<Record<number, string>>({})
  const [toast, setToast] = useState<string | null>(null)

  const load = () => Promise.all([listFormLinks(), listFormTemplates()]).then(([links, tpls]) => {
    setRows(links.map((l) => ({ ...l, isNew: false, dirty: false })))
    setTemplates(tpls)
  }, (e: unknown) => setError(toCounselError(e)))
  useEffect(() => { void load() }, [])

  if (error && !rows) return <ErrorBox message={errorText(error)} />
  if (!rows) return <Loading />

  const published = templates.filter((x) => x.published_version)
  const patch = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p, dirty: true } : r)))
  const save = async (i: number) => {
    const r = rows[i]
    if (!MANAGE_CODE_RE.test(r.manage_code.trim())) { setRowError({ ...rowError, [i]: t('links.error.code') }); return }
    if (!published.some((x) => x.id === r.template_id)) { setRowError({ ...rowError, [i]: t('links.error.template') }); return }
    setRowError({ ...rowError, [i]: '' })
    try {
      await setFormLink({ ...r, manage_code: r.manage_code.trim() })
      await load()
      setToast(t('links.saved'))
    } catch (e) { setRowError({ ...rowError, [i]: errorText(toCounselError(e)) }) }
  }
  const add = () => setRows([...rows, {
    manage_code: '', template_id: published[0]?.id ?? '', purchase_type: 'counsel_main', enabled: true, label: '', isNew: true, dirty: true,
  }])

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Button onClick={() => navigate('/admin/counsel/forms')}>←</Button>
        <Typography variant="h5">{t('links.title')}</Typography>
        <Box sx={{ flexGrow: 1 }} />
        {canManage && <Button variant="contained" onClick={add}>{t('links.add')}</Button>}
      </Stack>
      <Alert severity="info">{t('links.help')}</Alert>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              {(['links.col.code', 'links.col.label', 'links.col.template', 'links.col.type', 'links.col.flow', 'links.col.enabled'] as const)
                .map((c) => <TableCell key={c}>{t(c)}</TableCell>)}
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary">{t('links.empty')}</Typography></TableCell></TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.isNew ? `new-${i}` : r.manage_code}>
                <TableCell sx={{ minWidth: 150 }}>
                  <TextField size="small" value={r.manage_code} disabled={!canManage || !r.isNew} error={!!rowError[i]} helperText={rowError[i] || undefined}
                    onChange={(e) => patch(i, { manage_code: e.target.value })} slotProps={{ htmlInput: { maxLength: 20, 'aria-label': t('links.col.code') } }} />
                </TableCell>
                <TableCell sx={{ minWidth: 160 }}>
                  <TextField size="small" value={r.label ?? ''} disabled={!canManage} onChange={(e) => patch(i, { label: e.target.value })}
                    slotProps={{ htmlInput: { maxLength: 200, 'aria-label': t('links.col.label') } }} />
                </TableCell>
                <TableCell sx={{ minWidth: 200 }}>
                  <TextField size="small" select fullWidth value={r.template_id} disabled={!canManage} onChange={(e) => patch(i, { template_id: e.target.value })}
                    slotProps={{ htmlInput: { 'aria-label': t('links.col.template') } }}>
                    {published.map((x) => <MenuItem key={x.id} value={x.id}>{x.name} · {t('forms.publishedVersion', { n: x.published_version ?? 0 })}</MenuItem>)}
                  </TextField>
                </TableCell>
                <TableCell sx={{ minWidth: 130 }}>
                  <TextField size="small" select value={r.purchase_type} disabled={!canManage} onChange={(e) => patch(i, { purchase_type: e.target.value as PurchaseType })}>
                    {PURCHASE_TYPES.map((p) => <MenuItem key={p} value={p}>{purchaseTypeLabel(p)}</MenuItem>)}
                  </TextField>
                </TableCell>
                <TableCell sx={{ minWidth: 170 }}>
                  <TextField size="small" select value="counsel_first" disabled={!canManage}>
                    <MenuItem value="counsel_first">{t('links.flow.counsel_first')}</MenuItem>
                    <MenuItem value="test_first" disabled>{t('links.flow.test_first')}</MenuItem>
                  </TextField>
                </TableCell>
                <TableCell>
                  <Switch checked={r.enabled} disabled={!canManage} onChange={(e) => patch(i, { enabled: e.target.checked })}
                    slotProps={{ input: { 'aria-label': t('links.col.enabled') } }} />
                </TableCell>
                <TableCell>
                  {canManage && <Button size="small" variant="outlined" disabled={!r.dirty} onClick={() => void save(i)}>{t('links.save')}</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </Stack>
  )
}
