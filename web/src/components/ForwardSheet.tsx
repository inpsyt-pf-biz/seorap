import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Drawer, Stack, TextField, Typography } from '@mui/material'
import { useRef, useState } from 'react'
import type { BoxLine, DirectShareResponse, ForwardResponse } from '@core/apiTypes.ts'
import { t } from '@core/copy.ko.ts'
import { formatPhoneInput, normalizePhone } from '@core/phone.ts'
import { isNightKst } from '@core/time.ts'
import { api, ApiError, isSessionEnd } from '../lib/api'
import { failText } from '../lib/failText'
import { tokens } from '../theme/seorap'

type Step = 'input' | 'confirm' | 'self' | 'shared'
type Field = 'name' | 'phone'

export default function ForwardSheet({ line, onClose, onDone, onExpired }: {
  line: BoxLine | null; onClose: () => void; onDone: (message?: string) => void | Promise<void>; onExpired: () => void
}) {
  const [prevLine, setPrevLine] = useState(line)
  const [step, setStep] = useState<Step>('input')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<Field | null>(null)
  const [shared, setShared] = useState<{ copied: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // 시트를 새로 열 때마다 하나씩 올라가는 번호. 요청 ID 를 "이번에 연 시트"에 묶는 데 쓴다.
  const [openSeq, setOpenSeq] = useState(0)
  // 마지막으로 보낸 내용(시트·받는 분·번호)과 그 요청 ID. 같은 내용의 연타·재시도·본인 번호 확인은 같은 ID 로 보내고,
  // 내용을 고쳤으면 새 ID 로 보낸다. 서버는 같은 ID 면 내용을 보기 전에 이전 결과를 먼저 돌려주기 때문이다.
  const attemptRef = useRef<{ key: string; id: string } | null>(null)
  // state 는 화면이 다시 그려져야 바뀌므로, 그 전에 들어오는 두 번째 탭은 ref 로 막는다
  const busyRef = useRef(false)

  // 시트가 새 줄로 열리면 입력과 요청 ID 를 처음 상태로 되돌린다. 렌더 중에 맞춰야 이전 입력이 한 프레임도 비치지 않는다.
  if (prevLine !== line) {
    setPrevLine(line)
    setStep('input'); setName(''); setPhone(''); setError(null); setFieldError(null); setShared(null)
    setOpenSeq((n) => n + 1)
  }
  if (!line) return null

  const next = () => {
    const n = name.trim()
    // 검증 오류는 해당 칸에만 한 번 보인다(아래 경고 창에는 올리지 않는다)
    if (n.length < 1 || n.length > 20) { setError(null); setFieldError('name'); return }
    if (!normalizePhone(phone)) { setError(null); setFieldError('phone'); return }
    setError(null); setFieldError(null); setStep('confirm')
  }

  const send = async (confirmSelf: boolean) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true); setError(null)
    try {
      // 요청 ID 를 만드는 일이 던져도(보안 연결이 아닌 환경 등) 잠금이 남지 않도록 try 안에서 계산한다
      const key = `${openSeq}|${line.voucherId}|${name.trim()}|${normalizePhone(phone)}`
      if (attemptRef.current?.key !== key) attemptRef.current = { key, id: crypto.randomUUID() }
      await api<ForwardResponse>('forward/create', { voucherId: line.voucherId, name: name.trim(), phone, clientRequestId: attemptRef.current.id, confirmSelf })
      // 성공 안내는 시트가 아니라 서랍이 토스트로 보인다 (시트는 바로 닫힌다)
      await onDone(t('forward.sent', { name: name.trim() }))
    } catch (e) {
      if (isSessionEnd(e)) { onExpired(); return }
      if (e instanceof ApiError && e.extra.reason === 'self_number') { setStep('self'); return }
      // 그사이 줄 상태가 바뀌었다. 막다른 화면 대신 시트를 닫고 서랍을 새로 불러 진짜 상태를 보인다.
      if (e instanceof ApiError && e.code === 'CONFLICT') { await onDone(); return }
      if (e instanceof ApiError && e.code === 'VALIDATION' && (e.extra.field === 'name' || e.extra.field === 'phone')) {
        setFieldError(e.extra.field); setStep('input'); return
      }
      setError(failText(e))
    } finally { busyRef.current = false; setBusy(false) }
  }

  // 직접 공유는 같은 요청을 다시 보내면 서버가 거부한다(원문 링크를 다시 만들 수 없다). 처리 중에는 절대 두 번 보내지 않는다.
  const direct = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true); setError(null)
    try {
      const r = await api<DirectShareResponse>('forward/direct', { voucherId: line.voucherId, clientRequestId: crypto.randomUUID() })
      let copied = true
      try { await navigator.clipboard.writeText(r.text) } catch { copied = false }
      // 복사가 막힌 환경이면 문구를 그대로 보여 직접 길게 눌러 복사하게 한다. 링크는 다시 만들 수 없어 화면에서 바로 닫지 않는다.
      setShared({ copied, text: r.text }); setStep('shared')
    } catch (e) {
      if (isSessionEnd(e)) { onExpired(); return }
      if (e instanceof ApiError && e.code === 'CONFLICT' && e.extra.reason !== 'self_number') { await onDone(); return }
      setError(failText(e))
    } finally { busyRef.current = false; setBusy(false) }
  }

  // 직접 공유 결과 화면에서는 어떻게 닫든 서랍을 새로 불러온다(줄 상태가 바뀌었다)
  const dismiss = () => { if (step === 'shared') void onDone(); else onClose() }
  // 바깥을 누르거나 Esc 를 눌러도 처리 중에는 닫지 않는다 (명시적인 취소·닫기 버튼은 그대로 동작)
  const dismissIfIdle = () => { if (!busyRef.current) dismiss() }

  return (
    // 시트는 브라우저 전체 폭이 아니라 주 컬럼 폭 안에서 가운데에 놓인다 (폰에서는 꽉 찬다)
    <Drawer
      anchor="bottom" open onClose={dismissIfIdle}
      slotProps={{ paper: { sx: { width: '100%', maxWidth: tokens.layout.maxWidth, left: 0, right: 0, mx: 'auto', borderTopLeftRadius: 16, borderTopRightRadius: 16 } } }}
    >
      <Box sx={{ px: 2, py: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('forward.title', { test: line.testName })}</Typography>
          {step === 'input' && (
            <>
              <TextField
                label={t('forward.name')} value={name} slotProps={{ htmlInput: { maxLength: 20 } }}
                error={fieldError === 'name'} helperText={fieldError === 'name' ? t('forward.invalidName') : undefined}
                onChange={(e) => { setName(e.target.value); if (fieldError === 'name') setFieldError(null) }}
              />
              <TextField
                label={t('forward.phone')} value={phone} slotProps={{ htmlInput: { inputMode: 'tel' } }}
                error={fieldError === 'phone'} helperText={fieldError === 'phone' ? t('forward.invalidPhone') : undefined}
                onChange={(e) => { setPhone(formatPhoneInput(e.target.value)); if (fieldError === 'phone') setFieldError(null) }}
              />
              <Typography variant="body2" color="text.secondary">{t('forward.child')}</Typography>
              {/* 밤 안내는 지금 시각이 기준이라 그리는 때마다 읽는다 (입력할 때마다 다시 그려져 시트를 열어 둔 사이에도 맞는다) */}
              {/* oxlint-disable-next-line react/purity */}
              {isNightKst(new Date()) && <Alert severity="info">{t('forward.night')}</Alert>}
              <Button variant="contained" size="large" onClick={next}>{t('forward.next')}</Button>
              <Accordion disableGutters elevation={0}>
                <AccordionSummary><Typography variant="body2">{t('forward.more')}</Typography></AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    <Typography variant="body2" color="text.secondary">{t('forward.direct.warn')}</Typography>
                    <Button variant="outlined" disabled={busy} onClick={direct}>{t('forward.direct')}</Button>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Typography variant="body1">{t('forward.confirm')}</Typography>
              <Typography variant="h5">{name.trim()}</Typography>
              <Typography variant="h5">{phone}</Typography>
              <Stack direction="row" spacing={1}>
                <Button fullWidth variant="outlined" onClick={() => { setError(null); setStep('input') }}>{t('forward.edit')}</Button>
                <Button fullWidth variant="contained" disabled={busy} onClick={() => send(false)}>{t('forward.send')}</Button>
              </Stack>
            </>
          )}
          {step === 'self' && (
            <>
              <Typography variant="body1">{t('forward.self')}</Typography>
              <Stack direction="row" spacing={1}>
                <Button fullWidth variant="outlined" onClick={onClose}>{t('common.cancel')}</Button>
                <Button fullWidth variant="contained" disabled={busy} onClick={() => send(true)}>{t('forward.selfSend')}</Button>
              </Stack>
            </>
          )}
          {step === 'shared' && shared && (
            <>
              {shared.copied
                ? <Alert severity="success">{t('forward.direct.copied')}</Alert>
                : <Alert severity="info" sx={{ wordBreak: 'break-all', userSelect: 'all' }}>{shared.text}</Alert>}
              <Button fullWidth variant="contained" onClick={dismiss}>{t('common.close')}</Button>
            </>
          )}
          {error && <Alert severity="warning">{error}</Alert>}
        </Stack>
      </Box>
    </Drawer>
  )
}
