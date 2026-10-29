import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { CounselFormResponse } from '@core/apiTypes.ts'
import { type AnswerProblem, type Answers, checkAnswers } from '@core/counselForm.ts'
import { t } from '@core/copy.ko.ts'
import CounselForm from '../components/CounselForm'
import Wordmark from '../components/Wordmark'
import { api, ApiError } from '../lib/api'
import { tokens } from '../theme/seorap'
import StatePage from './StatePage'

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
      .then((f) => { setForm(f); setView('form') })
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

  // 첫 문제 문항으로 화면을 옮긴다 (스크롤을 못 하는 환경이면 건너뛴다)
  const scrollTo = (id: string) => document.querySelector(`[data-field="${id}"]`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })

  const submit = async () => {
    if (!form || busyRef.current) return
    const problems = checkAnswers(form.definition, answers)
    setErrors(problems)
    const first = form.definition.fields.find((f) => problems[f.id])
    if (first) { setMessage(t('counsel.fix')); scrollTo(first.id); return }
    busyRef.current = true; setBusy(true); setMessage(null)
    try {
      await api('counsel/submit', { orderId, templateId: form.templateId, version: form.version, answers, clientRequestId: crypto.randomUUID() })
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
          <>
            <Stack spacing={0.5}>
              <Typography variant="h5">{t('counsel.title')}</Typography>
              <Typography variant="body2" color="text.secondary">{form.productName}</Typography>
            </Stack>
            <Box sx={{ p: 2, borderRadius: 3, bgcolor: tokens.surface[0] }}>
              <CounselForm definition={form.definition} value={answers} onChange={setAnswers} errors={errors} disabled={busy} />
            </Box>
            {message && <Alert severity="warning">{message}</Alert>}
            <Button variant="contained" size="large" disabled={busy} onClick={submit}>{t('counsel.submit')}</Button>
          </>
        )}
      </Stack>
    </Box>
  )
}
