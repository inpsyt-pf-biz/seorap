import { Box, Button, ButtonBase, InputBase, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import { visuallyHidden } from '@mui/utils'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  type AnswerProblem, type Answers, type AvailabilityAnswer, type AvailabilityLabel, type FormDefinition, type FormField, type Provider,
  DEFAULT_AVAILABILITY, LIMITS, ageOn, answerText, checkAnswers, fieldLabel, hiddenIds, pruneHidden, takesAnswer,
} from '@core/counselForm.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import { tokens } from '../theme/seorap'
import Choice from './Choice'
import ConsentSheet from './ConsentSheet'
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
// 생년월일은 만 나이를 읽을 틈을 두고 넘긴다
const AGE_MS = 700
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
// 신청자 생년월일은 6자리(950312)가 기본이고 8자리(19950312)도 받는다 (11-10 건우님 "19 안 써도 되면").
// 19·20으로 시작하는 6자리는 8자리를 쓰는 중일 수 있어 기다리고, [다음]·엔터를 누르면 6자리로 읽는다.
// 6자리 연도: 올해 두 자리보다 크면 1900년대, 아니면 2000년대
const isBirth = (f: FormField) => f.mapsTo === 'client_birth'
function parseDigits(f: FormField, d: string, force: boolean): string {
  if (d.length === 8) return toIso(d)
  if (!isBirth(f) || d.length !== 6 || (!force && /^(19|20)/.test(d))) return ''
  const yy = Number(d.slice(0, 2))
  return `${yy > new Date().getFullYear() % 100 ? 19 : 20}${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`
}
// 저장된 날짜를 칸에 다시 넣을 때: 생년월일은 6자리로
const digitsOf = (f: FormField, v: unknown) => {
  const d = toDigits(v)
  return isBirth(f) && d.length === 8 ? d.slice(2) : d
}
const pad = (n: number) => String(n).padStart(2, '0')
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
// 신청자 생년월일 칸이면 만 나이를 붙인다 (다른 날짜 문항은 나이가 아니다)
const ageOf = (f: FormField, iso: string) => (f.mapsTo === 'client_birth' ? ageOn(iso, todayIso()) : null)
// 확인 화면의 날짜: 1995. 3. 12. (만 31세)
function dateText(f: FormField, iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const age = ageOf(f, iso)
  return `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.${age === null ? '' : ` (${t('steps.age', { n: age })})`}`
}

// 약관 한 줄: 동의했으면 청록 체크, 누르면 바텀시트로 본문을 연다
function TermRow({ f, on, onView, first }: { f: FormField; on: boolean; onView: () => void; first?: boolean }) {
  return (
    <ButtonBase
      onClick={onView}
      sx={{ width: '100%', minHeight: 52, px: 2, gap: 1.25, justifyContent: 'flex-start', textAlign: 'left', borderTop: first ? 'none' : `1px solid ${tokens.surface[200]}` }}
    >
      <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 22, height: 22, flexShrink: 0, color: on ? tokens.teal[700] : tokens.surface[300] }}>
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </Box>
      <Typography variant="body2" sx={{ flex: 1, fontWeight: 500, wordBreak: 'keep-all' }}>
        {/* 앞에 [필수]·[선택]을 달므로 제목 끝의 "(선택)"은 뺀다 */}
        <Box component="span" sx={{ color: f.required ? tokens.teal[700] : tokens.text.secondary }}>[{t(f.required ? 'form.required' : 'form.optional')}]</Box>{' '}
        {f.label.replace(/\s*\((선택|필수)\)$/, '')}
        {on && <Box component="span" sx={visuallyHidden}>, {t('steps.agreed')}</Box>}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{t('steps.view')} ›</Typography>
    </ButtonBase>
  )
}

export default function CounselSteps({ definition: def, value, onChange, onSubmit, providers = [], errors, message, busy, preview, minHeight = 'calc(var(--frame-min-h) - 120px)' }: Props) {
  const [cur, setCur] = useState<string>('start')
  const [problem, setProblem] = useState<AnswerProblem | null>(null)
  const [backToReview, setBackToReview] = useState(false)
  // 열린 약관 시트: ids 를 차례로 보여 주고, 마지막에 동의하면 then 이 'advance' 일 때 다음 질문으로
  const [sheet, setSheet] = useState<{ ids: string[]; i: number; then: 'advance' | 'stay' } | null>(null)
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
    if (s && 'kind' in s && s.f.type === 'date') setDigits(digitsOf(s.f, value[s.f.id]))
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
    if (s && 'kind' in s && s.f.type === 'date') setDigits(digitsOf(s.f, ans[s.f.id]))
  }

  // 고르는 질문: 고른 칸을 잠깐 보여 주고 넘긴다. 그동안 들어온 터치는 무시한다 (다음 질문의 같은 자리를 잘못 누르지 않게)
  const choose = (ans: Answers, ms = ADVANCE_MS) => {
    if (lock.current) return
    lock.current = true
    onChange(ans)
    setTimeout(() => { lock.current = false; advance(ans) }, ms)
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
    let ans = value
    // 날짜: 칸에 쓴 숫자를 지금 읽는다 (19·20으로 시작하는 6자리 생년월일은 여기서 6자리로 읽힌다)
    if (s.f.type === 'date' && digits !== '') {
      const iso = parseDigits(s.f, digits, true)
      if (!iso) { setProblem('format'); return }
      if (value[s.f.id] !== iso) { ans = { ...value, [s.f.id]: iso }; onChange(ans) }
    }
    const p = checkAnswers(def, ans)[s.f.id]
    if (p) { setProblem(p); return }
    advance(ans)
  }

  // 시트에서 동의(또는 선택 약관을 동의하지 않음)하면 다음 약관으로, 마지막이면 닫고 필요하면 다음 질문으로
  const sheetField = sheet ? def.fields.find((f) => f.id === sheet.ids[sheet.i]) ?? null : null
  const answerSheet = (agreed: boolean) => {
    if (!sheet || !sheetField) return
    setStartErr(false)
    const ans = set(sheetField.id, agreed)
    if (sheet.i + 1 < sheet.ids.length) { setSheet({ ...sheet, i: sheet.i + 1 }); return }
    setSheet(null)
    if (sheet.then === 'advance') advance(ans)
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
    // 시작하기: 아직 동의하지 않은 약관을 은행 앱처럼 하나씩 시트로 보여 준다 (이미 고른 선택 약관은 다시 묻지 않는다)
    const begin = () => {
      const pending = startConsents.filter((c) => value[c.id] !== true && (c.required || value[c.id] === undefined))
      if (pending.length) setSheet({ ids: pending.map((c) => c.id), i: 0, then: 'advance' })
      else advance(value)
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
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">{t('steps.start.terms')}</Typography>
            <Box sx={{ bgcolor: tokens.surface[0], border: `1px solid ${tokens.surface[200]}`, borderRadius: tokens.radius.card, overflow: 'hidden' }}>
              {startConsents.map((c, i) => (
                <TermRow key={c.id} f={c} first={i === 0} on={value[c.id] === true} onView={() => setSheet({ ids: [c.id], i: 0, then: 'stay' })} />
              ))}
            </Box>
          </Stack>
        )}
        {startErr && <Typography role="alert" variant="body2" color="error">{t('steps.consentNeeded')}</Typography>}
        <Button variant="contained" size="large" fullWidth onClick={begin}>{t('steps.begin')}</Button>
      </Stack>
    )
  } else if (step.key === 'review') {
    const hidden = hiddenIds(def, value)
    const rows = def.fields.filter((f) => takesAnswer(f) && f.type !== 'consent' && !hidden.has(f.id))
    const all = buildSteps(def, value)
    body = (
      <Stack spacing={2} sx={{ flex: 1 }}>
        {title(t('steps.review.title'), <Help text={t('steps.review.body')} />)}
        {/* 11-10 검수: 표처럼 좌우로 두지 않고, 흰 카드 안에 질문(작은 회색) 위 · 답(크고 진하게) 아래로 쌓는다 */}
        <Box sx={{ bgcolor: tokens.surface[0], border: `1px solid ${tokens.surface[200]}`, borderRadius: tokens.radius.card, overflow: 'hidden' }}>
          {rows.map((f, i) => {
            const v = value[f.id]
            const empty = v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
              || (f.type === 'availability' && !(v as AvailabilityAnswer).cells?.length)
            const text = empty ? t('steps.review.empty') : f.type === 'date' ? dateText(f, String(v)) : answerText(f, v)
            return (
              <ButtonBase
                key={f.id} onClick={() => { setBackToReview(true); goTo(stepOf(all, f.id)) }}
                sx={{
                  width: '100%', px: 2, py: 1.75, gap: 1.5, alignItems: 'flex-start', justifyContent: 'flex-start', textAlign: 'left',
                  borderTop: i ? `1px solid ${tokens.surface[200]}` : 'none',
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: tokens.text.secondary, wordBreak: 'keep-all' }}>{fieldLabel(def, f, value)}</Typography>
                  <Typography
                    sx={{
                      mt: 0.5, fontSize: 16, lineHeight: 1.5, fontWeight: empty ? 400 : 600,
                      color: empty ? tokens.text.disabled : tokens.text.primary,
                      whiteSpace: 'pre-line', wordBreak: 'keep-all', overflowWrap: 'anywhere',
                      display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 4, overflow: 'hidden',
                    }}
                  >
                    {text}
                  </Typography>
                </Box>
                <Typography sx={{ flexShrink: 0, fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: tokens.teal[700] }}>{t('steps.review.edit')}</Typography>
              </ButtonBase>
            )
          })}
        </Box>
        {message && <Typography role="alert" variant="body2" color="error">{message}</Typography>}
        {preview && <Typography variant="body2" color="text.secondary">{t('steps.preview')}</Typography>}
        {/* 확인 목록이 길어도 신청 버튼은 화면 바닥에 붙어 늘 보인다 (목록과 붙지 않게 위 여백) */}
        <Box sx={{ mt: 'auto !important', position: 'sticky', bottom: 0, pt: 2, pb: 1, bgcolor: tokens.surface.page }}>
          <Button variant="contained" size="large" fullWidth disabled={busy || preview} onClick={submit}>
            {t('steps.submit')}
          </Button>
        </Box>
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
          {title(s.next ? fieldLabel(def, s.next, value) : f.label, <Help text={t('steps.sensitive.why')} />)}
          <Box sx={{ bgcolor: tokens.surface[0], border: `1px solid ${tokens.surface[200]}`, borderRadius: tokens.radius.card, overflow: 'hidden' }}>
            <TermRow f={f} first on={value[f.id] === true} onView={() => setSheet({ ids: [f.id], i: 0, then: 'stay' })} />
          </Box>
          <Stack spacing={1} sx={{ mt: 'auto !important' }}>
            {/* 동의하고 적기: 약관 시트를 먼저 보여 주고, 시트에서 동의하면 질문으로 */}
            <Button
              variant="contained" size="large" fullWidth
              onClick={() => (value[f.id] === true ? advance(value) : setSheet({ ids: [f.id], i: 0, then: 'advance' }))}
            >
              {t('steps.sensitive.agree')}
            </Button>
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
        const iso = parseDigits(f, d, false)
        if (!iso) { set(f.id, undefined); return }
        const ans = { ...value, [f.id]: iso }
        const p = checkAnswers(def, ans)[f.id]
        if (p) { onChange(ans); setProblem(p); return }
        choose(ans, ageOf(f, iso) === null ? ADVANCE_MS : AGE_MS)
      }
      const shownIso = parseDigits(f, digits, false)
      const age = shownIso && !problem ? ageOf(f, shownIso) : null
      const hint = t(isBirth(f) ? 'steps.birth' : 'steps.date')
      body = (
        <Stack spacing={2} sx={{ flex: 1 }}>
          {notes}
          {title(fieldLabel(def, f, value), <Help text={f.help ? `${f.help}\n${hint}` : hint} />)}
          <TextField
            value={digits} autoFocus placeholder={isBirth(f) ? '950312' : '20261110'} error={!!problem}
            onChange={(e) => onDigits(e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8, 'aria-label': f.label, enterKeyHint: 'next' } }}
            onKeyDown={(e) => { if (e.key === 'Enter') confirm(s) }}
          />
          {age !== null && (
            <Typography role="status" sx={{ fontSize: 16, fontWeight: 700, color: tokens.teal[700] }}>{t('steps.age', { n: age })}</Typography>
          )}
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
            value={typeof v === 'string' ? v : ''} autoFocus multiline={long} minRows={long ? 4 : undefined} error={!!problem} placeholder={f.placeholder}
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
      <ConsentSheet
        f={sheetField}
        count={sheet ? { i: sheet.i + 1, n: sheet.ids.length } : undefined}
        extra={sheetField?.consentKind === 'third_party' && def.fields.some((x) => x.type === 'providers')
          ? <Providers f={def.fields.find((x) => x.type === 'providers')!} providers={providers} />
          : undefined}
        onAgree={() => answerSheet(true)}
        onDecline={sheetField && !sheetField.required ? () => answerSheet(false) : undefined}
        onClose={() => setSheet(null)}
      />
    </Stack>
  )
}
