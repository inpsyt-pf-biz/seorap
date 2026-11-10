import { Box, Button, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { CounselFormResponse } from '@core/apiTypes.ts'
import { type AnswerProblem, type Answers, type FormDefinition, checkAnswers, takesAnswer } from '@core/counselForm.ts'
import { t } from '@core/copy.ko.ts'
import CounselSteps from '../components/CounselSteps'
import Wordmark from '../components/Wordmark'
import { api, ApiError } from '../lib/api'
import { tokens } from '../theme/seorap'
import StatePage from './StatePage'

// 쓰던 답을 이 탭에 잠깐 둔다 (카톡에서 다른 앱을 다녀와 화면이 새로 열려도 이어 쓰게). 민감정보 답은 두지 않고, 내면 지운다
const draftKey = (orderId: string) => `seorap.counsel.draft.${orderId}`
function loadDraft(orderId: string, def: FormDefinition): Answers {
  try {
    const raw = JSON.parse(sessionStorage.getItem(draftKey(orderId)) ?? '{}') as Answers
    const ok = new Set(def.fields.filter((f) => takesAnswer(f) && !f.sensitive).map((f) => f.id))
    return Object.fromEntries(Object.entries(raw).filter(([id]) => ok.has(id)))
  } catch { return {} }
}
function saveDraft(orderId: string, def: FormDefinition, a: Answers) {
  try {
    const keep = Object.fromEntries(Object.entries(a).filter(([id]) => !def.fields.find((f) => f.id === id)?.sensitive))
    sessionStorage.setItem(draftKey(orderId), JSON.stringify(keep))
  } catch { /* 저장이 막힌 브라우저면 그냥 넘어간다 */ }
}
const clearDraft = (orderId: string) => { try { sessionStorage.removeItem(draftKey(orderId)) } catch { /* 위와 같음 */ } }

type View = 'loading' | 'form' | 'done' | 'noForm' | 'reauth' | 'expired' | 'error'

// 신청서를 열거나 낼 때의 오류 → 화면. 'already' 는 이미 낸 주문(서랍으로 돌아간다), null 은 이 화면에서 안내할 오류
function errorView(e: unknown): View | 'already' | null {
  const code = e instanceof ApiError ? e.code : null
  const reason = e instanceof ApiError ? e.extra.reason : null
  if (code === 'REAUTH_REQUIRED') return 'reauth'
  if (code === 'SESSION_EXPIRED') return 'expired'
  if (code === 'CONFLICT' && reason === 'already_submitted') return 'already'
  if (code === 'CONFLICT' && reason === 'no_form') return 'noForm'
  return null
}

// 상담 신청서 `/box/counsel/:orderId` (B2, build-spec §4-6). 문항은 상담 어드민 템플릿의 게시된 판.
// 제출하면 서버가 상담 원장으로 넘기고 이 주문의 검사 잠금을 푼다. 낸 내용은 다시 보여 주지 않는다.
export default function CounselPage() {
  const { orderId = '' } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState<View>('loading')
  const [form, setForm] = useState<CounselFormResponse | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [errors, setErrors] = useState<Record<string, AnswerProblem>>({})
  const [message, setMessage] = useState<string | null>(null)
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)

  // 처리한 오류면 true. 이 화면에서 문장으로 안내할 오류는 false
  const fail = (e: unknown) => {
    const v = errorView(e)
    if (v === 'already') navigate('/box', { replace: true })
    else if (v) setView(v)
    return v !== null
  }

  // 화면이 열릴 때 신청서를 불러오는 것은 서버와의 동기화다
  useEffect(() => {
    api<CounselFormResponse>('counsel/form', { orderId })
      .then((f) => { setForm(f); setAnswers(loadDraft(orderId, f.definition)); setView('form') })
      .catch((e) => {
        const v = errorView(e)
        if (v === 'already') navigate('/box', { replace: true })
        else setView(v ?? 'error')
      })
  }, [orderId, navigate])

  // 관리자가 새 판을 게시해 다시 불러올 때는, 아직 있는 문항의 답을 그대로 둔다
  const reload = async () => {
    const f = await api<CounselFormResponse>('counsel/form', { orderId })
    setForm(f)
    setAnswers((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => f.definition.fields.some((x) => x.id === id))))
  }

  const change = (a: Answers) => { setAnswers(a); if (form) saveDraft(orderId, form.definition, a) }

  // 단계형 화면이 숨은 문항의 답을 뺀 답을 넘긴다
  const submit = async (ready: Answers) => {
    if (!form || busyRef.current) return
    const problems = checkAnswers(form.definition, ready)
    if (Object.keys(problems).length) { setErrors(problems); setMessage(t('counsel.fix')); return }
    busyRef.current = true; setBusy(true); setMessage(null)
    try {
      await api('counsel/submit', { orderId, templateId: form.templateId, version: form.version, answers: ready, clientRequestId: crypto.randomUUID() })
      clearDraft(orderId)
      setView('done')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONFLICT' && e.extra.reason === 'form_changed') {
        try { await reload(); setMessage(t('counsel.changed')) } catch (e2) { if (!fail(e2)) setView('error') }
      } else if (e instanceof ApiError && e.code === 'CONFLICT' && e.extra.reason === 'already_in_ledger') {
        setMessage(t('counsel.inLedger'))
      } else if (e instanceof ApiError && e.code === 'VALIDATION' && e.extra.problems) {
        setErrors(e.extra.problems as Record<string, AnswerProblem>); setMessage(t('counsel.fix'))
      } else if (!fail(e)) {
        setMessage(t('error.generic'))
      }
    } finally { busyRef.current = false; setBusy(false) }
  }

  if (view === 'reauth') return <StatePage kind="sessionExpired" message={t('counsel.reauth')} />
  if (view === 'expired') return <StatePage kind="sessionExpired" />
  if (view === 'noForm') return <StatePage kind="error" message={t('counsel.noForm')} />
  if (view === 'error') return <StatePage kind="error" />
  if (view === 'loading' || !form) return null

  return (
    <Box component="main" sx={{ maxWidth: tokens.layout.maxWidth, mx: 'auto', px: 2, py: 3 }}>
      <Stack spacing={3}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark />
          <Button variant="text" onClick={() => navigate('/box')}>{t('counsel.back')}</Button>
        </Stack>
        {view === 'done' ? (
          <Stack spacing={2}>
            <Typography variant="h5">{t('counsel.done.title')}</Typography>
            <Typography variant="body1" color="text.secondary">{t('counsel.done.body')}</Typography>
            <Button variant="contained" size="large" onClick={() => navigate('/box', { replace: true })}>{t('counsel.back')}</Button>
          </Stack>
        ) : (
          // 한 화면 한 질문 (11-10). 제목·상품명은 시작 화면 안내로 대신한다
          <CounselSteps
            definition={form.definition} value={answers} onChange={change} onSubmit={submit}
            errors={errors} message={message} busy={busy} providers={form.providers}
          />
        )}
      </Stack>
    </Box>
  )
}
