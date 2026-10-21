import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Checkbox, Divider, Drawer, Fab, FormControlLabel, IconButton, Stack, TextField, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { demoDb } from './fakeSupabase'

// 체험판 오른쪽 아래 '검수 의견': 요청마다 열어 볼 건, 확인할 점(체크·의견), 의견 복사.
// 답은 이 브라우저에만 남고, 복사한 글을 메신저로 보내 받는다.

// 열어 볼 건: 가짜 데이터의 구매자 이름(name)으로 찾아 상세로 가거나, 정해진 화면(to)으로 간다
type Case = { name?: string; to?: string; desc: CopyKey }
type Item = { id: string; q: CopyKey; ph?: CopyKey }
type Section = { title: CopyKey; done: CopyKey; cases: Case[]; items: Item[] }

const SECTIONS: Section[] = [
  {
    title: 'review.req1',
    done: 'review.req1.done',
    cases: [{ name: '가나다', desc: 'review.case.ganadaOrder' }, { name: '다라마', desc: 'review.case.darama' }],
    items: [{ id: '1a', q: 'review.q.1a' }, { id: '1b', q: 'review.q.1b' }, { id: '1c', q: 'review.q.1c' }],
  },
  {
    title: 'review.req2',
    done: 'review.req2.done',
    cases: [
      { name: '가나다', desc: 'review.case.ganadaExams' }, { name: '아자차', desc: 'review.case.ajachaExams' },
      { name: '차카타', desc: 'review.case.chakata' }, { name: '타파하', desc: 'review.case.tapahaExams' },
      { to: '/admin/counsel/purchases', desc: 'review.case.list' },
    ],
    items: [
      { id: '2a', q: 'review.q.2a' }, { id: '2b', q: 'review.q.2b', ph: 'review.ph.2b' }, { id: '2c', q: 'review.q.2c', ph: 'review.ph.2c' },
      { id: '2d', q: 'review.q.2d' }, { id: '2e', q: 'review.q.2e', ph: 'review.ph.2e' },
    ],
  },
  {
    title: 'review.req3',
    done: 'review.req3.done',
    cases: [
      { name: '하*호', desc: 'review.case.hasho' }, { to: '/admin/counsel/purchases/inbox', desc: 'review.case.inbox' },
      { name: '타파하', desc: 'review.case.tapaha' }, { name: '자차카', desc: 'review.case.jachaka' },
      { name: '아자차', desc: 'review.case.ajacha' }, { name: '가나다', desc: 'review.case.ganada' },
      { name: '마바사', desc: 'review.case.mabasa' }, { name: '바사아', desc: 'review.case.basaa' }, { name: '나다라', desc: 'review.case.nadara' },
    ],
    items: [
      { id: '3a', q: 'review.q.3a' }, { id: '3b', q: 'review.q.3b', ph: 'review.ph.3b' }, { id: '3c', q: 'review.q.3c' },
      { id: '3d', q: 'review.q.3d', ph: 'review.ph.3d' }, { id: '3e', q: 'review.q.3e' }, { id: '3f', q: 'review.q.3f', ph: 'review.ph.3f' },
    ],
  },
]
const ITEMS = SECTIONS.flatMap((s) => s.items)
const NOTES: CopyKey[] = ['review.note.fake', 'review.note.links', 'review.note.report', 'review.note.hq', 'review.note.saved']

type Answer = { ok: boolean; note: string }
type Answers = { who: string; general: string; items: Record<string, Answer> }
const KEY = 'counsel-demo-review'

function load(): Answers {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Answers> | null
    if (v && typeof v === 'object') return { who: v.who ?? '', general: v.general ?? '', items: v.items ?? {} }
  } catch { /* 저장소가 막힌 브라우저 */ }
  return { who: '', general: '', items: {} }
}

// 신청서의 구매자 이름, 없으면 네이버 주문자(가린 이름)로 구매 건을 찾는다
function purchasePath(name: string): string | null {
  const tables = demoDb.tables
  const app = (tables.applications ?? []).find((a) => a.client_name === name)
  const orderer = app ? null : (tables.naver_orderers ?? []).find((o) => o.name_masked === name)
  const id = (app ?? orderer)?.purchase_id
  return typeof id === 'string' ? `/admin/counsel/purchases/${id}` : null
}

function compose(a: Answers): string {
  const lines = [t('review.export.title')]
  if (a.who.trim()) lines.push(t('review.export.who', { name: a.who.trim() }))
  for (const s of SECTIONS) {
    lines.push('', t(s.title))
    for (const i of s.items) {
      const v = a.items[i.id]
      const note = v?.note.trim() ?? ''
      const mark = v?.ok ? t('review.export.ok') : note ? t('review.export.note') : t('review.export.none')
      lines.push(`- [${mark}] ${t(i.q)}`)
      if (note) lines.push(`  → ${note.replace(/\n/g, '\n    ')}`)
    }
  }
  if (a.general.trim()) lines.push('', t('review.general'), a.general.trim())
  return lines.join('\n')
}

export default function ReviewPanel() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [a, setA] = useState<Answers>(load)
  const [copied, setCopied] = useState<'' | 'done' | 'fallback'>('')
  const [text, setText] = useState('')
  const fallbackRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(a))
    } catch { /* 저장소가 막힌 브라우저면 이번 창에서만 남는다 */ }
  }, [a])

  useEffect(() => {
    if (copied === 'fallback') fallbackRef.current?.select()
  }, [copied, text])

  const seen = ITEMS.filter((i) => a.items[i.id]?.ok || a.items[i.id]?.note.trim()).length
  const count = t('review.count', { done: seen, total: ITEMS.length })
  const setItem = (id: string, patch: Partial<Answer>) =>
    setA((prev) => ({ ...prev, items: { ...prev.items, [id]: { ...(prev.items[id] ?? { ok: false, note: '' }), ...patch } } }))

  const go = (c: Case) => {
    const to = c.to ?? (c.name ? purchasePath(c.name) : null)
    if (!to) return
    setOpen(false)
    navigate(to)
  }

  const copy = () => {
    const out = compose(a)
    setText(out)
    const fallback = () => setCopied('fallback')
    if (!navigator.clipboard) return fallback()
    navigator.clipboard.writeText(out).then(() => setCopied('done'), fallback)
  }

  return (
    <>
      <Fab variant="extended" color="primary" onClick={() => setOpen(true)} sx={{ position: 'fixed', right: 24, bottom: 24 }}>
        <RateReviewOutlinedIcon sx={{ mr: 1 }} />
        {t('review.fab')} · {count}
      </Fab>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 } } } }}>
        <Stack spacing={2.5} sx={{ p: 3 }}>
          <Stack direction="row" sx={{ alignItems: 'center' }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('review.title')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>{count}</Typography>
            <IconButton aria-label={t('review.close')} onClick={() => setOpen(false)}><CloseIcon /></IconButton>
          </Stack>
          <Typography variant="body2">{t('review.intro')}</Typography>
          <Box sx={{ bgcolor: 'background.default', borderRadius: 2, p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('review.noteTitle')}</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5 }}>
              {NOTES.map((k) => <Typography key={k} component="li" variant="body2" color="text.secondary">{t(k)}</Typography>)}
            </Box>
          </Box>

          {SECTIONS.map((s) => (
            <Stack key={s.title} spacing={1.5}>
              <Divider />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t(s.title)}</Typography>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t('review.done')}</Typography>
                <Typography variant="body2">{t(s.done)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t('review.cases')}</Typography>
                <Stack sx={{ alignItems: 'flex-start' }}>
                  {s.cases.map((c) => (
                    <Button key={`${c.name ?? c.to}-${c.desc}`} size="small" onClick={() => go(c)} sx={{ textAlign: 'left', justifyContent: 'flex-start' }}>
                      {c.name ? `${c.name} · ${t(c.desc)}` : t(c.desc)}
                    </Button>
                  ))}
                </Stack>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t('review.checks')}</Typography>
              {s.items.map((i) => {
                const v = a.items[i.id] ?? { ok: false, note: '' }
                return (
                  <Stack key={i.id} spacing={0.5}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{t(i.q)}</Typography>
                    <FormControlLabel
                      control={<Checkbox size="small" checked={v.ok} onChange={(e) => setItem(i.id, { ok: e.target.checked })} />}
                      label={<Typography variant="body2">{t('review.okay')}</Typography>}
                    />
                    <TextField size="small" multiline minRows={1} placeholder={t(i.ph ?? 'review.ph.default')} value={v.note}
                      onChange={(e) => setItem(i.id, { note: e.target.value })} />
                  </Stack>
                )
              })}
            </Stack>
          ))}

          <Divider />
          <TextField size="small" label={t('review.who')} placeholder={t('review.whoPh')} value={a.who}
            onChange={(e) => setA((prev) => ({ ...prev, who: e.target.value }))} />
          <TextField size="small" multiline minRows={3} label={t('review.general')} placeholder={t('review.generalPh')} value={a.general}
            onChange={(e) => setA((prev) => ({ ...prev, general: e.target.value }))} />
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={copy}>{t('review.copy')}</Button>
            {copied === 'done' && <Typography variant="body2" color="success.main">{t('review.copied')}</Typography>}
          </Stack>
          {copied === 'fallback' && (
            <Stack spacing={1}>
              <Typography variant="body2" color="warning.main">{t('review.copyFallback')}</Typography>
              <TextField multiline minRows={6} value={text} inputRef={fallbackRef} slotProps={{ htmlInput: { readOnly: true } }} />
            </Stack>
          )}
        </Stack>
      </Drawer>
    </>
  )
}
