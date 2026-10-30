import { useEffect, useState } from 'react'
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type Announcements, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import DragIndicator from '@mui/icons-material/DragIndicator'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, FormControlLabel, List, ListItem, ListItemButton, ListItemText, Paper,
  Snackbar, Stack, Switch, TextField, Typography,
} from '@mui/material'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { reorderIds } from '@counsel-core/help.ts'
import { contactOk, HELP_LIMITS, helpItemProblems, type HelpContent } from '@seorap-core/helpContent.ts'
import HelpArticle from '@seorap-web/components/HelpArticle'
import MarkdownEditor from '../../../components/MarkdownEditor'
import { ErrorBox, Loading } from '../../../components/PageState'
import {
  deleteHelpItem, getHelpContact, listHelpItems, reorderHelpItems, saveHelpContact, saveHelpItem, type HelpRow,
} from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'
import { tokens } from '../../../theme/admin'

type Draft = { id: string | null; question: string; answer_md: string; buttons: HelpRow['buttons']; hidden: boolean }
const blank = (): Draft => ({ id: null, question: '', answer_md: '', buttons: [], hidden: false })

// 끌어 놓기 안내(화면 읽기 프로그램). 기본은 영어라 한국어로 바꾼다
const announcements: Announcements = {
  onDragStart: () => t('help.drag'),
  onDragOver: () => '',
  onDragEnd: () => t('help.reordered'),
  onDragCancel: () => t('help.link.cancel'),
}

// 질문 목록의 한 줄: 왼쪽 손잡이를 끌어 순서를 바꾼다(키보드: 손잡이에서 스페이스 → 화살표 → 스페이스)
function SortableRow({ row, selected, draggable, onPick }: { row: HelpRow; selected: boolean; draggable: boolean; onPick: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: !draggable })
  return (
    <ListItem
      ref={setNodeRef} disablePadding
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{ position: 'relative', zIndex: isDragging ? 1 : 'auto', bgcolor: isDragging ? tokens.surface[50] : 'transparent', boxShadow: isDragging ? 3 : 'none' }}
    >
      {draggable && (
        <Box
          component="button" type="button" ref={setActivatorNodeRef} aria-label={t('help.drag')} {...attributes} {...listeners}
          sx={{
            alignSelf: 'stretch', display: 'grid', placeItems: 'center', px: 0.5, border: 0, bgcolor: 'transparent', color: 'text.secondary',
            cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', '&:hover': { color: 'text.primary' },
          }}
        >
          <DragIndicator fontSize="small" />
        </Box>
      )}
      <ListItemButton selected={selected} onClick={onPick} sx={{ pl: draggable ? 0.5 : 2 }}>
        <ListItemText primary={row.question} />
        {row.hidden && <Chip size="small" label={t('help.hiddenChip')} sx={{ ml: 1 }} />}
      </ListItemButton>
    </ListItem>
  )
}

// 서랍 도움말 관리 (10-30, help-admin-design.md). 왼쪽 질문 목록(끌어서 순서), 가운데 편집(MDXEditor), 오른쪽 서랍 휴대폰 폭 미리보기
export default function HelpAdminPage() {
  const { state } = useSession()
  const canManage = hasCap(state, 'help.manage')
  const [rows, setRows] = useState<HelpRow[] | null>(null)
  const [contact, setContact] = useState('')
  // 다시 읽을 때마다 문의처 에디터를 새로 띄운다(MDXEditor 는 처음 값만 읽는다)
  const [loads, setLoads] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [problem, setProblem] = useState('')
  // 저장·순서·삭제·문의처 저장이 서버에서 실패한 것. 질문을 고르지 않아도 보이게 화면 위에 둔다
  const [failure, setFailure] = useState('')
  const [error, setError] = useState<CounselError | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // 마우스는 4px 넘게 움직여야 끌기로 본다(손잡이를 누르기만 해도 끌리지 않게)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const load = () => Promise.all([listHelpItems(), getHelpContact()]).then(([r, c]) => {
    setRows(r)
    setContact(c)
    setLoads((n) => n + 1)
  }, (e: unknown) => setError(toCounselError(e)))
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
  // 놓는 순간 목록·미리보기를 먼저 바꾸고 저장한다. 실패하면 run 이 다시 읽어 서버 순서로 돌아간다
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return
    const base = rows.map((r) => r.id)
    const ids = reorderIds(base, String(e.active.id), String(e.over.id))
    if (ids === base) return
    setRows(ids.map((id) => rows.find((r) => r.id === id)!))
    void run(() => reorderHelpItems(ids), 'help.reordered')
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

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '280px 1fr 360px' }, alignItems: 'start' }}>
        <Paper>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
            accessibility={{ announcements, screenReaderInstructions: { draggable: t('help.dragHelp') } }}>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <List aria-label={t('help.list')} dense>
                {rows.map((r) => (
                  <SortableRow key={r.id} row={r} selected={draft?.id === r.id} draggable={canManage} onPick={() => pick(r)} />
                ))}
              </List>
            </SortableContext>
          </DndContext>
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          {draft ? (
            <Stack spacing={2}>
              <TextField label={t('help.question')} value={draft.question} onChange={(e) => patch({ question: e.target.value })}
                slotProps={{ htmlInput: { maxLength: HELP_LIMITS.question } }} disabled={!canManage} />
              <MarkdownEditor key={draft.id ?? 'new'} label={t('help.answer')} value={draft.answer_md}
                onChange={(v) => patch({ answer_md: v })} maxLength={HELP_LIMITS.answer} />
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
            <MarkdownEditor key={`contact-${loads}`} label={t('help.contact')} value={contact} onChange={setContact}
              maxLength={HELP_LIMITS.contact} error={contactOk(contact) ? undefined : t('help.problem.contact')} />
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
