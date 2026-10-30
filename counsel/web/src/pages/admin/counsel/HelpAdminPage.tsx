import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, FormControlLabel, List, ListItemButton, ListItemText, Paper, Snackbar,
  Stack, Switch, TextField, Typography,
} from '@mui/material'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { contactOk, HELP_LIMITS, helpItemProblems, type HelpContent } from '@seorap-core/helpContent.ts'
import HelpArticle from '@seorap-web/components/HelpArticle'
import MarkdownEditor from '../../../components/MarkdownEditor'
import { ErrorBox, Loading } from '../../../components/PageState'
import {
  deleteHelpItem, getHelpContact, listHelpItems, moveHelpItem, saveHelpContact, saveHelpItem, type HelpRow,
} from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'
import { tokens } from '../../../theme/admin'

type Draft = { id: string | null; question: string; answer_md: string; buttons: HelpRow['buttons']; hidden: boolean }
const blank = (): Draft => ({ id: null, question: '', answer_md: '', buttons: [], hidden: false })

// 서랍 도움말 관리 (10-30, help-admin-design.md). 왼쪽 질문 목록, 가운데 편집, 오른쪽 서랍 휴대폰 폭 미리보기
export default function HelpAdminPage() {
  const { state } = useSession()
  const canManage = hasCap(state, 'help.manage')
  const [rows, setRows] = useState<HelpRow[] | null>(null)
  const [contact, setContact] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [problem, setProblem] = useState('')
  // 저장·옮기기·삭제·문의처 저장이 서버에서 실패한 것. 질문을 고르지 않아도 보이게 화면 위에 둔다
  const [failure, setFailure] = useState('')
  const [error, setError] = useState<CounselError | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = () => Promise.all([listHelpItems(), getHelpContact()]).then(([r, c]) => { setRows(r); setContact(c) }, (e: unknown) => setError(toCounselError(e)))
  useEffect(() => { void load() }, [])
  if (error && !rows) return <ErrorBox message={errorText(error)} />
  if (!rows) return <Loading />

  // 미리보기: 편집 중인 질문은 고친 내용으로, 숨긴 질문은 빼고
  const shown: HelpRow[] = rows.map((r) => (draft && r.id === draft.id ? { ...r, ...draft, id: r.id } : r))
  if (draft && !draft.id) shown.push({ ...draft, id: 'new', position: 0, updated_at: '' })
  const preview: HelpContent = {
    items: shown.filter((r) => !r.hidden).map((r) => ({ id: r.id, question: r.question || '…', answerMd: r.answer_md, buttons: r.buttons })),
    contact,
  }

  const run = async (f: () => Promise<unknown>, done: CopyKey) => {
    try {
      await f()
      setFailure('')
      setToast(t(done))
    } catch (e) {
      // 다른 관리자가 먼저 지웠거나 옮겼을 수 있으니 목록을 다시 읽는다
      setFailure(errorText(toCounselError(e)))
    }
    await load()
  }
  const save = async () => {
    if (!draft) return
    const d = {
      ...draft, question: draft.question.trim(), answer_md: draft.answer_md.trim(),
      buttons: draft.buttons.map((b) => ({ label: b.label.trim(), url: b.url.trim() })),
    }
    const p = helpItemProblems({ question: d.question, answerMd: d.answer_md, buttons: d.buttons })
    if (p.length) { setProblem(t(`help.problem.${p[0]}` as CopyKey)); return }
    setProblem('')
    await run(async () => { const id = await saveHelpItem(d); setDraft({ ...d, id }) }, 'help.saved')
  }
  const patch = (p: Partial<Draft>) => { if (draft) setDraft({ ...draft, ...p }) }
  const pick = (r: HelpRow) => { setDraft({ id: r.id, question: r.question, answer_md: r.answer_md, buttons: r.buttons, hidden: r.hidden }); setProblem('') }
  const remove = () => {
    setConfirm(false)
    const id = draft?.id
    if (id) void run(async () => { await deleteHelpItem(id); setDraft(null) }, 'help.saved')
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="h5">{t('help.title')}</Typography>
        <Box sx={{ flexGrow: 1 }} />
        {canManage && <Button variant="contained" onClick={() => { setDraft(blank()); setProblem('') }}>{t('help.add')}</Button>}
      </Stack>
      <Typography variant="body2" color="text.secondary">{t('help.intro')}</Typography>
      {failure && <Alert severity="error" onClose={() => setFailure('')}>{failure}</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '260px 1fr 360px' }, alignItems: 'start' }}>
        <Paper>
          <List aria-label={t('help.list')} dense>
            {rows.map((r, i) => (
              <ListItemButton key={r.id} selected={draft?.id === r.id} onClick={() => pick(r)}>
                <ListItemText primary={r.question} />
                {r.hidden && <Chip size="small" label={t('help.hiddenChip')} sx={{ ml: 1 }} />}
                {canManage && (
                  <Stack direction="row" onClick={(e) => e.stopPropagation()}>
                    <Button size="small" sx={{ minWidth: 32 }} disabled={i === 0} aria-label={t('help.up')}
                      onClick={() => void run(() => moveHelpItem(r.id, -1), 'help.saved')}>↑</Button>
                    <Button size="small" sx={{ minWidth: 32 }} disabled={i === rows.length - 1} aria-label={t('help.down')}
                      onClick={() => void run(() => moveHelpItem(r.id, 1), 'help.saved')}>↓</Button>
                  </Stack>
                )}
              </ListItemButton>
            ))}
          </List>
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          {draft ? (
            <Stack spacing={2}>
              <TextField label={t('help.question')} value={draft.question} onChange={(e) => patch({ question: e.target.value })}
                slotProps={{ htmlInput: { maxLength: HELP_LIMITS.question } }} disabled={!canManage} />
              <MarkdownEditor label={t('help.answer')} value={draft.answer_md} onChange={(v) => patch({ answer_md: v })} maxLength={HELP_LIMITS.answer} />
              <Typography variant="subtitle2">{t('help.buttons')}</Typography>
              {draft.buttons.map((b, i) => (
                <Stack key={i} direction="row" spacing={1}>
                  <TextField size="small" label={t('help.buttonLabel')} value={b.label} slotProps={{ htmlInput: { maxLength: HELP_LIMITS.buttonLabel } }}
                    onChange={(e) => patch({ buttons: draft.buttons.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <TextField size="small" label={t('help.buttonUrl')} value={b.url} sx={{ flexGrow: 1 }}
                    onChange={(e) => patch({ buttons: draft.buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                  <Button aria-label={t('help.removeButton')} onClick={() => patch({ buttons: draft.buttons.filter((_, j) => j !== i) })}>×</Button>
                </Stack>
              ))}
              {draft.buttons.length < HELP_LIMITS.buttons && (
                <Button sx={{ alignSelf: 'flex-start' }} onClick={() => patch({ buttons: [...draft.buttons, { label: '', url: 'https://' }] })}>
                  {t('help.addButton')}
                </Button>
              )}
              <FormControlLabel control={<Switch checked={draft.hidden} onChange={(e) => patch({ hidden: e.target.checked })} />} label={t('help.hidden')} />
              {problem && <Alert severity="error">{problem}</Alert>}
              {canManage && (
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" onClick={() => void save()}>{t('help.save')}</Button>
                  {draft.id && <Button color="error" onClick={() => setConfirm(true)}>{t('help.delete')}</Button>}
                </Stack>
              )}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">{t('help.pick')}</Typography>
          )}
          <Stack spacing={1} sx={{ mt: 3, pt: 2, borderTop: `1px solid ${tokens.surface[200]}` }}>
            <TextField label={t('help.contact')} value={contact} onChange={(e) => setContact(e.target.value)}
              error={!contactOk(contact)} helperText={contactOk(contact) ? `${[...contact].length} / ${HELP_LIMITS.contact}` : t('help.problem.contact')} />
            {canManage && (
              <Button sx={{ alignSelf: 'flex-start' }} disabled={!contactOk(contact)}
                onClick={() => void run(() => saveHelpContact(contact.trim()), 'help.saved')}>{t('help.saveContact')}</Button>
            )}
          </Stack>
        </Paper>

        <Box component="section" aria-label={t('help.preview')} sx={{ position: { lg: 'sticky' }, top: 16 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('help.preview')}</Typography>
          <Box sx={{ maxWidth: 360, bgcolor: tokens.surface.page, borderRadius: tokens.radius.sheet, p: 2, border: `1px solid ${tokens.surface[200]}` }}>
            <Typography variant="h5" sx={{ mb: 2 }}>{t('help.previewTitle')}</Typography>
            <HelpArticle content={preview} />
          </Box>
        </Box>
      </Box>

      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogContent>{t('help.deleteConfirm')}</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>{t('help.cancel')}</Button>
          <Button color="error" onClick={remove}>{t('help.delete')}</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </Stack>
  )
}
