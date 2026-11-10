import { Box, Button, ButtonBase, Collapse, InputBase, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  type AnswerProblem, type Answers, type AvailabilityAnswer, type AvailabilityLabel, type FormDefinition, type FormField, type Provider,
  DEFAULT_AVAILABILITY, LIMITS, answerText, checkAnswers, fieldLabel, hiddenIds, pruneHidden, takesAnswer,
} from '@core/counselForm.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import { tokens } from '../theme/seorap'
import Choice from './Choice'
import { Providers } from './CounselForm'

// 상담 신청서 단계형 화면 (11-10). 한 화면에 질문 하나, 고르는 질문은 누르면 0.25초 뒤 다음으로 넘어간다.
// 답·검사·숨김 규칙은 counselForm(엔진)이 정하고, 이 부품은 순서와 넘김만 맡는다. 값은 부모가 들고 있다.

type AvailPart = 'method' | 'cells' | 'start' | 'contact'
type Step =
  | { key: 'start' }
  | { key: 'review' }
  | { key: string; kind: 'field'; f: FormField; notes: FormField[] }
  | { key: string; kind: 'sens'; f: FormField; next?: FormField; notes: FormField[] }
  | { key: string; kind: 'avail'; f: FormField; part: AvailPart; notes: FormField[] }
type QStep = Exclude<Step, { key: 'start' } | { key: 'review' }>

const ADVANCE_MS = 250
const isNote = (f: FormField) => f.type === 'section' || f.type === 'notice'
// 시작 화면에 모으는 동의: 민감정보 동의는 그 질문 바로 앞에서 따로 묻는다
const isStartConsent = (f: FormField) => f.type === 'consent' && f.consentKind !== 'sensitive'

// 지금 답으로 보이는 단계들. 숨은 문항은 빠지고, 안내 블록은 다음 질문 위에 붙는다
function buildSteps(def: FormDefinition, answers: Answers): Step[] {
  const hidden = hiddenIds(def, answers)
  const out: Step[] = [{ key: 'start' }]
  const firstQ = def.fields.findIndex((f) => takesAnswer(f) && !isStartConsent(f))
  let notes: FormField[] = []
  def.fields.forEach((f, i) => {
    if (isNote(f)) { if (i > firstQ) notes.push(f); return }
    if (!takesAnswer(f) || isStartConsent(f) || hidden.has(f.id)) return
    if (f.type === 'consent') {
      const next = def.fields.slice(i + 1).find((x) => x.sensitive && takesAnswer(x))
      out.push({ key: f.id, kind: 'sens', f, next, notes })
    } else if (f.type === 'availability') {
      const cfg = f.availability ?? DEFAULT_AVAILABILITY
      const parts: AvailPart[] = [
        ...(cfg.methods.length ? ['method' as const] : []), 'cells',
        ...(cfg.askStartDate ? ['start' as const] : []), ...(cfg.contactTimes.length ? ['contact' as const] : []),
      ]
      parts.forEach((part, j) => out.push({ key: `${f.id}:${part}`, kind: 'avail', f, part, notes: j === 0 ? notes : [] }))
    } else {
      out.push({ key: f.id, kind: 'field', f, notes })
    }
    notes = []
  })
  out.push({ key: 'review' })
  return out
}

// 문항이 처음 나오는 단계 (가능 시간대는 칸 고르기)
const stepOf = (steps: Step[], id: string) =>
  steps.find((s) => s.key === id || s.key === `${id}:cells`)?.key ?? 'start'

type Props = {
  definition: FormDefinition
  value: Answers
  onChange: (next: Answers) => void
  onSubmit: (answers: Answers) => void
  providers?: Provider[]
  // 서버가 돌려준 문제. 바뀌면 첫 문제 질문으로 간다
  errors?: Record<string, AnswerProblem>
  message?: string | null
  busy?: boolean
  // 어드민 미리보기: 제출 버튼 대신 안내
  preview?: boolean
  // 화면 높이 (바닥 버튼이 엄지 자리에 오게). 어드민 미리보기 칸은 더 낮게
  minHeight?: number | string
}

function Help({ text }: { text?: string }) {
  return text ? <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{text}</Typography> : null
}

function ErrorText({ p }: { p: AnswerProblem | null | undefined }) {
  return p ? <Typography role="alert" variant="body2" color="error">{t(`form.error.${p}` as CopyKey)}</Typography> : null
}

// 기타(직접 입력): 평소에는 "기타"라는 선택지처럼 보이고, 누르면 그 자리가 입력 칸이 되어 키보드가 바로 열린다.
// 칸 자체가 입력이라 누르는 손길에서 바로 포커스가 잡힌다 (휴대폰이 키보드를 연다)
function OtherChoice({ text, onText, onEnter, disabled }: { text: string; onText: (s: string) => void; onEnter: () => void; disabled?: boolean }) {
  const [focused, setFocused] = useState(false)
  const active = focused || text !== ''
  return (
    <InputBase
      value={text} disabled={disabled} placeholder={active ? t('form.otherPlaceholder') : t('form.other')}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onChange={(e) => onText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
      inputProps={{ 'aria-label': t('form.other'), maxLength: LIMITS.short, enterKeyHint: 'next' }}
      sx={{
        minHeight: 48, px: 1.5, borderRadius: tokens.radius.control,
        bgcolor: active ? tokens.teal[100] : tokens.surface[50],
        border: `1px solid ${active ? tokens.teal[700] : tokens.surface[300]}`,
        '& input': { textAlign: active ? 'left' : 'center', fontWeight: 500, color: tokens.teal[700] },
        '& input::placeholder': { opacity: 1, color: active ? tokens.text.secondary : tokens.text.primary, fontWeight: active ? 400 : 500 },
      }}
    />
  )
}

// 8자리 숫자 → YYYY-MM-DD. 키패드에 엔터가 없는 휴대폰을 위해 다 쓰면 넘어간다
const toIso = (d: string) => (d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : '')
const toDigits = (v: unknown) => (typeof v === 'string' ? v.replace(/\D/g, '').slice(0, 8) : '')

export default function CounselSteps({ definition: def, value, onChange, onSubmit, providers = [], errors, message, busy, preview, minHeight = 'calc(var(--frame-min-h) - 120px)' }: Props) {
  const [cur, setCur] = useState<string>('start')
  const [problem, setProblem] = useState<AnswerProblem | null>(null)
  const [backToReview, setBackToReview] = useState(false)
  const [openHelp, setOpenHelp] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [startErr, setStartErr] = useState(false)
  const [digits, setDigits] = useState('')
  const lock = useRef(false)
  const curRef = useRef(cur)
  curRef.current = cur

  const steps = buildSteps(def, value)
  const step = steps.find((s) => s.key === cur) ?? steps[0]
  const questions = steps.filter((s): s is QStep => 'kind' in s)
  const qIndex = questions.findIndex((s) => s.key === step.key)
  const startConsents = def.fields.filter(isStartConsent)

  const goTo = (key: string) => {
    setProblem(null); setStartErr(false); setCur(key)
    const s = buildSteps(def, value).find((x) => x.key === key)
    if (s && 'kind' in s && s.f.type === 'date') setDigits(toDigits(value[s.f.id]))
  }

  // 서버가 문제를 돌려주면 첫 문제 질문으로 (화면이 서버 응답에 맞추는 동기화)
  useEffect(() => {
    if (!errors) return
    const first = def.fields.find((f) => errors[f.id])
    if (!first) return
    const s = buildSteps(def, value)
    setCur(first.type === 'consent' && first.consentKind !== 'sensitive' ? 'start' : stepOf(s, first.id))
    setProblem(errors[first.id])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors])

  // 다음 단계: 새 답으로 다시 세어(조건부 문항이 생기거나 사라질 수 있다) 지금 단계 다음으로
  const advance = (ans: Answers) => {
    setProblem(null)
    if (backToReview) { setBackToReview(false); setCur('review'); return }
    const list = buildSteps(def, ans)
    const i = list.findIndex((s) => s.key === curRef.current)
    const next = list[i + 1]?.key ?? 'review'
    setCur(next)
    const s = list[i + 1]
    if (s && 'kind' in s && s.f.type === 'date') setDigits(toDigits(ans[s.f.id]))
  }

  // 고르는 질문: 고른 칸을 잠깐 보여 주고 넘긴다. 그동안 들어온 터치는 무시한다 (다음 질문의 같은 자리를 잘못 누르지 않게)
  const choose = (ans: Answers) => {
    if (lock.current) return
    lock.current = true
    onChange(ans)
    setTimeout(() => { lock.current = false; advance(ans) }, ADVANCE_MS)
  }

  const set = (id: string, v: unknown) => {
    setProblem(null)
    const next = { ...value }
    if (v === undefined) delete next[id]; else next[id] = v
    onChange(next)
    return next
  }

  // 이 질문의 답을 검사하고 넘어간다
  const confirm = (s: QStep) => {
    if (s.kind === 'avail' && s.part !== 'cells') { advance(value); return }
    const p = checkAnswers(def, value)[s.f.id]
    if (p) { setProblem(p); return }
    advance(value)
  }

  const back = () => {
    const i = steps.findIndex((s) => s.key === step.key)
    if (i > 0) goTo(steps[i - 1].key)
  }

  const submit = () => {
    const ans = pruneHidden(def, value)
    const problems = checkAnswers(def, ans)
    const first = def.fields.find((f) => problems[f.id])
    if (first) {
      setCur(isStartConsent(first) ? 'start' : stepOf(buildSteps(def, ans), first.id))
      setProblem(problems[first.id]); setStartErr(isStartConsent(first))
      return
    }
    if (!preview) onSubmit(ans)
  }

  const header = (
    <Stack spacing={1}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
        {step.key !== 'start' ? (
          <ButtonBase onClick={back} aria-label={t('steps.back')} sx={{ width: 40, height: 40, borderRadius: tokens.radius.pill }}>
            <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 22, height: 22 }}>
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Box>
          </ButtonBase>
        ) : <span />}
        {qIndex >= 0 && <Typography variant="body2" color="text.secondary">{qIndex + 1} / {questions.length}</Typography>}
      </Stack>
      <LinearProgress
        variant="determinate" aria-hidden
        value={step.key === 'start' ? 0 : step.key === 'review' ? 100 : ((qIndex + 1) / (questions.length + 1)) * 100}
        sx={{ height: 4, borderRadius: '2px', bgcolor: tokens.surface[200] }}
      />
    </Stack>
  )

  const title = (text: string, help?: ReactNode) => (
    <Stack spacing={1} sx={{ pt: 2 }}>
      <Typography component="h2" variant="h5" sx={{ fontWeight: 700, lineHeight: 1.4, wordBreak: 'keep-all' }}>{text}</Typography>
      {help}
    </Stack>
  )

  // 바닥 버튼: 비어 있는 선택 질문이면 "건너뛰기", 아니면 "다음"
  const bottom = (s: QStep, empty: boolean) => {
    const optional = s.kind === 'avail' ? s.part !== 'cells' || !s.f.required : !s.f.required
    return (
      <Button variant="contained" size="large" fullWidth onClick={() => confirm(s)} sx={{ mt: 'auto !important' }}>
        {t(empty && optional ? 'steps.skip' : 'steps.next')}
      </Button>
    )
  }

  let body: ReactNode
  if (step.key === 'start') {
    const allChecked = startConsents.every((c) => value[c.id] === true)
    const begin = () => {
      if (!touched || allChecked) {
        const next = { ...value }
        startConsents.forEach((c) => { next[c.id] = true })
        onChange(next); advance(next); return
      }
      if (startConsents.some((c) => c.required && value[c.id] !== true)) { setStartErr(true); return }
      advance(value)
    }
    const notes = def.fields.slice(0, Math.max(0, def.fields.findIndex((f) => takesAnswer(f) && !isStartConsent(f)))).filter(isNote)
    body = (
      <Stack spacing={2.5} sx={{ flex: 1 }}>
        {title(t('steps.start.title'), (
          <>
            <Help text={def.intro} />
            <Typography variant="body2" color="text.secondary">{t('steps.start.count', { n: questions.length })}</Typography>
          </>
        ))}
        {notes.map((n) => (
          <Box key={n.id} sx={{ p: 2, borderRadius: tokens.radius.card, bgcolor: tokens.surface[50], border: `1px solid ${tokens.surface[200]}` }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>{n.label}</Typography>
            <Help text={n.help} />
          </Box>
        ))}
        <Box sx={{ mt: 'auto !important' }} />
        {startConsents.length > 0 && (
          <Stack sx={{ border: `1px solid ${tokens.surface[300]}`, borderRadius: tokens.radius.card, px: 2, py: 0.5 }}>
            {startConsents.map((c, i) => {
              const on = value[c.id] === true
              return (
                <Box key={c.id} sx={{ py: 1, borderTop: i ? `1px solid ${tokens.surface[200]}` : 'none' }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <ButtonBase
                      role="checkbox" aria-checked={on} aria-label={c.label}
                      onClick={() => { setTouched(true); setStartErr(false); set(c.id, !on) }}
                      sx={{ flex: 1, justifyContent: 'flex-start', gap: 1, py: 0.5, textAlign: 'left', borderRadius: tokens.radius.control }}
                    >
                      <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 22, height: 22, flexShrink: 0, color: on ? tokens.teal[700] : tokens.surface[300] }}>
                        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        [{t(c.required ? 'form.required' : 'form.optional')}] {c.label}
                      </Typography>
                    </ButtonBase>
                    {c.help && (
                      <Button size="small" variant="text" onClick={() => setOpenHelp(openHelp === c.id ? null : c.id)} aria-expanded={openHelp === c.id}>
                        {t(openHelp === c.id ? 'steps.hide' : 'steps.view')}
                      </Button>
                    )}
                  </Stack>
                  <Collapse in={openHelp === c.id} unmountOnExit>
                    <Box sx={{ mt: 1, p: 1.5, maxHeight: 220, overflowY: 'auto', borderRadius: tokens.radius.control, bgcolor: tokens.surface[50] }}>
                      <Help text={c.help} />
                    </Box>
                  </Collapse>
                  {c.consentKind === 'third_party' && def.fields.some((f) => f.type === 'providers') && (
                    <Box sx={{ mt: 1 }}>
                      <Providers f={def.fields.find((f) => f.type === 'providers')!} providers={providers} />
                    </Box>
                  )}
                </Box>
              )
            })}
          </Stack>
        )}
        {startErr && <Typography role="alert" variant="body2" color="error">{t('steps.consentNeeded')}</Typography>}
        <Button variant="contained" size="large" fullWidth onClick={begin}>
          {t(!touched || allChecked ? (startConsents.length ? 'steps.agreeAll' : 'steps.begin') : 'steps.begin')}
        </Button>
      </Stack>
    )
  } else if (step.key === 'review') {
    const hidden = hiddenIds(def, value)
    const rows = def.fields.filter((f) => takesAnswer(f) && f.type !== 'consent' && !hidden.has(f.id))
    const all = buildSteps(def, value)
    body = (
      <Stack spacing={2} sx={{ flex: 1 }}>
        {title(t('steps.review.title'), <Help text={t('steps.review.body')} />)}
        <Stack>
          {rows.map((f) => {
            const v = value[f.id]
            const empty = v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
              || (f.type === 'availability' && !(v as AvailabilityAnswer).cells?.length)
            return (
              <ButtonBase
                key={f.id} onClick={() => { setBackToReview(true); goTo(stepOf(all, f.id)) }}
                sx={{ py: 1.5, gap: 2, justifyContent: 'space-between', textAlign: 'left', borderBottom: `1px solid ${tokens.surface[200]}` }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ flex: '0 0 40%' }}>{fieldLabel(def, f, value)}</Typography>
                <Typography variant="body2" sx={{ textAlign: 'right', color: empty ? tokens.text.disabled : tokens.text.primary, wordBreak: 'keep-all' }}>
                  {empty ? t('steps.review.empty') : answerText(f, v)}
                </Typography>
              </ButtonBase>
            )
          })}
        </Stack>
        {message && <Typography role="alert" variant="body2" color="error">{message}</Typography>}
        {preview && <Typography variant="body2" color="text.secondary">{t('steps.preview')}</Typography>}
        <Button variant="contained" size="large" fullWidth disabled={busy || preview} onClick={submit} sx={{ mt: 'auto !important' }}>
          {t('steps.submit')}
        </Button>
      </Stack>
    )
  } else {
    const s = step as QStep
    const f = s.f
    const v = value[f.id]
    const notes = s.notes.map((n) => (
      <Box key={n.id}>
        <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 700 }}>{n.label}</Typography>
        <Help text={n.help} />
      </Box>
    ))
    if (s.kind === 'sens') {
      body = (
        <Stack spacing={2} sx={{ flex: 1 }}>
          {notes}
          {title(s.next ? fieldLabel(def, s.next, value) : f.label, (
            <>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{f.label}</Typography>
              {f.help && (
                <Box sx={{ p: 1.5, maxHeight: 220, overflowY: 'auto', borderRadius: tokens.radius.control, bgcolor: tokens.surface[50], border: `1px solid ${tokens.surface[200]}` }}>
                  <Help text={f.help} />
                </Box>
              )}
            </>
          ))}
          <Stack spacing={1} sx={{ mt: 'auto !important' }}>
            <Button variant="contained" size="large" fullWidth onClick={() => advance(set(f.id, true))}>{t('steps.sensitive.agree')}</Button>
            <Button variant="text" size="large" fullWidth onClick={() => advance(set(f.id, false))}>{t('steps.sensitive.skip')}</Button>
          </Stack>
        </Stack>
      )
    } else if (s.kind === 'avail') {
      const cfg = f.availability ?? DEFAULT_AVAILABILITY
      const a: AvailabilityAnswer = (v as AvailabilityAnswer | undefined) ?? { cells: [] }
      const text = (k: AvailabilityLabel) => cfg.labels?.[k] || t(`form.avail.${k}`)
      const put = (patch: Partial<AvailabilityAnswer>) => ({ ...value, [f.id]: { ...a, ...patch } })
      if (s.part === 'cells') {
        const toggle = (cell: string) => set(f.id, { ...a, cells: a.cells.includes(cell) ? a.cells.filter((c) => c !== cell) : [...a.cells, cell] })
        body = (
          <Stack spacing={2.5} sx={{ flex: 1 }}>
            {notes}
            {title(fieldLabel(def, f, value), <Help text={f.help || text('pick')} />)}
            <Box sx={{ display: 'grid', gridTemplateColumns: `56px repeat(${cfg.slots.length}, 1fr)`, gap: 1, alignItems: 'center' }}>
              <span />
              {cfg.slots.map((sl) => (
                <Typography key={sl.id} variant="caption" color="text.secondary" sx={{ textAlign: 'center', lineHeight: 1.3 }}>{sl.label}<br />{sl.hours}</Typography>
              ))}
              {cfg.days.map((d) => [
                <Typography key={`${d.id}-l`} variant="body2">{d.label}</Typography>,
                ...cfg.slots.map((sl) => {
                  const cell = `${d.id}|${sl.id}`
                  return <Choice key={cell} selected={a.cells.includes(cell)} onClick={() => toggle(cell)} label={`${d.label} ${sl.label} 상담 가능`} />
                }),
              ])}
            </Box>
            <ErrorText p={problem} />
            {bottom(s, a.cells.length === 0)}
          </Stack>
        )
      } else if (s.part === 'start') {
        body = (
          <Stack spacing={2.5} sx={{ flex: 1 }}>
            {notes}
            {title(text('start'))}
            <TextField
              type="date" value={a.startDate ?? ''}
              onChange={(e) => { const d = e.target.value || undefined; if (d) choose(put({ startDate: d })); else set(f.id, { ...a, startDate: undefined }) }}
              slotProps={{ htmlInput: { 'aria-label': text('start') } }}
            />
            {bottom(s, !a.startDate)}
          </Stack>
        )
      } else {
        const key = s.part === 'method' ? 'method' : 'contactTime'
        const opts = s.part === 'method' ? cfg.methods : cfg.contactTimes
        body = (
          <Stack spacing={1.5} sx={{ flex: 1 }}>
            {notes}
            {title(text(s.part === 'method' ? 'method' : 'contact'))}
            <Box sx={{ pt: 1 }} />
            {opts.map((o) => <Choice key={o} selected={a[key] === o} onClick={() => choose(put({ [key]: o }))}>{o}</Choice>)}
            <Button variant="text" size="large" fullWidth onClick={() => advance(value)} sx={{ mt: 'auto !important' }}>{t('steps.skip')}</Button>
          </Stack>
        )
      }
    } else if (f.type === 'single' || f.type === 'multi') {
      const opts = f.options ?? []
      const list = f.type === 'single' ? (typeof v === 'string' ? [v] : []) : (Array.isArray(v) ? (v as string[]) : [])
      const other = list.find((x) => !opts.includes(x)) ?? ''
      const picked = list.filter((x) => opts.includes(x))
      const setOther = (s2: string) => {
        if (f.type === 'single') set(f.id, s2 === '' ? undefined : s2)
        else set(f.id, s2 === '' ? picked : [...picked, s2])
      }
      const tap = (o: string) => {
        if (f.type === 'single') { choose({ ...value, [f.id]: o }); return }
        const nextPicked = picked.includes(o) ? picked.filter((x) => x !== o) : opts.filter((x) => x === o || picked.includes(x))
        set(f.id, other ? [...nextPicked, other] : nextPicked)
      }
      body = (
        <Stack spacing={1.5} sx={{ flex: 1 }}>
          {notes}
          {title(fieldLabel(def, f, value), <Help text={f.help || (f.type === 'multi' ? t('steps.multi') : undefined)} />)}
          <Box sx={{ pt: 1 }} />
          {opts.map((o) => <Choice key={o} selected={picked.includes(o)} onClick={() => tap(o)}>{o}</Choice>)}
          {f.other && <OtherChoice text={other} onText={setOther} onEnter={() => confirm(s)} />}
          <ErrorText p={problem} />
          {(f.type === 'multi' || f.other || !f.required)
            ? bottom(s, list.length === 0)
            : null}
        </Stack>
      )
    } else if (f.type === 'date') {
      const onDigits = (raw: string) => {
        const d = raw.replace(/\D/g, '').slice(0, 8)
        setDigits(d)
        if (d.length < 8) { set(f.id, undefined); return }
        const ans = { ...value, [f.id]: toIso(d) }
        const p = checkAnswers(def, ans)[f.id]
        if (p) { onChange(ans); setProblem(p); return }
        choose(ans)
      }
      body = (
        <Stack spacing={2} sx={{ flex: 1 }}>
          {notes}
          {title(fieldLabel(def, f, value), <Help text={f.help ? `${f.help}\n${t('steps.date')}` : t('steps.date')} />)}
          <TextField
            value={digits} autoFocus placeholder="19950312" error={!!problem}
            onChange={(e) => onDigits(e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8, 'aria-label': f.label, enterKeyHint: 'next' } }}
            onKeyDown={(e) => { if (e.key === 'Enter') confirm(s) }}
          />
          <ErrorText p={problem} />
          {bottom(s, digits === '')}
        </Stack>
      )
    } else {
      const long = f.type === 'long'
      body = (
        <Stack spacing={2} sx={{ flex: 1 }}>
          {notes}
          {title(fieldLabel(def, f, value), <Help text={f.help} />)}
          <TextField
            value={typeof v === 'string' ? v : ''} autoFocus multiline={long} minRows={long ? 4 : undefined} error={!!problem}
            onChange={(e) => set(f.id, e.target.value)}
            onKeyDown={(e) => { if (!long && e.key === 'Enter') { e.preventDefault(); confirm(s) } }}
            slotProps={{ htmlInput: { maxLength: LIMITS[long ? 'long' : 'short'], 'aria-label': f.label, enterKeyHint: long ? undefined : 'next' } }}
          />
          <ErrorText p={problem} />
          {bottom(s, typeof v !== 'string' || v.trim() === '')}
        </Stack>
      )
    }
  }

  return (
    <Stack spacing={1} sx={{ minHeight }}>
      {header}
      <Box
        key={step.key}
        sx={{
          flex: 1, display: 'flex', flexDirection: 'column',
          animation: 'stepIn .18s ease-out',
          '@keyframes stepIn': { from: { opacity: 0, transform: 'translateX(12px)' }, to: { opacity: 1, transform: 'none' } },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        {body}
      </Box>
    </Stack>
  )
}
