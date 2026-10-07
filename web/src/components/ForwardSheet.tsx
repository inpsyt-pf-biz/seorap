import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Drawer, Stack, TextField, Typography } from '@mui/material'
import { useRef, useState } from 'react'
import type { BoxLine, DirectShareResponse, ForwardResponse } from '@core/apiTypes.ts'
import { t } from '@core/copy.ko.ts'
import { formatPhoneInput, normalizePhone } from '@core/phone.ts'
import { isNightKst } from '@core/time.ts'
import { api, ApiError } from '../lib/api'
import { failText } from '../lib/failText'

type Step = 'input' | 'confirm' | 'self' | 'shared'

export default function ForwardSheet({ line, onClose, onDone, onExpired }: {
  line: BoxLine | null; onClose: () => void; onDone: () => void | Promise<void>; onExpired: () => void
}) {
  const [prevLine, setPrevLine] = useState(line)
  const [step, setStep] = useState<Step>('input')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [shared, setShared] = useState<{ copied: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // 시트를 열 때 요청 ID 를 하나 만들어 연타·재시도에도 같은 ID 로 보낸다 (서버가 같은 ID 는 한 번만 처리)
  const [requestId, setRequestId] = useState(() => (line ? crypto.randomUUID() : ''))
  // state 는 화면이 다시 그려져야 바뀌므로, 그 전에 들어오는 두 번째 탭은 ref 로 막는다
  const busyRef = useRef(false)

  // 시트가 새 줄로 열리면 입력과 요청 ID 를 처음 상태로 되돌린다. 렌더 중에 맞춰야 이전 입력이 한 프레임도 비치지 않는다.
  if (prevLine !== line) {
    setPrevLine(line)
    setStep('input'); setName(''); setPhone(''); setError(null); setInfo(null); setShared(null)
    setRequestId(line ? crypto.randomUUID() : '')
  }
  if (!line) return null

  const next = () => {
    const n = name.trim()
    if (n.length < 1 || n.length > 20) { setError(t('forward.invalidName')); return }
    if (!normalizePhone(phone)) { setError(t('forward.invalidPhone')); return }
    setError(null); setStep('confirm')
  }

  const send = async (confirmSelf: boolean) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true); setError(null)
    try {
      await api<ForwardResponse>('forward/create', { voucherId: line.voucherId, name: name.trim(), phone, clientRequestId: requestId, confirmSelf })
      setInfo(t('forward.sent', { name: name.trim() }))
      await onDone()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { onExpired(); return }
      if (e instanceof ApiError && e.extra.reason === 'self_number') { setStep('self'); return }
      if (e instanceof ApiError && e.code === 'VALIDATION' && (e.extra.field === 'name' || e.extra.field === 'phone')) {
        setError(e.extra.field === 'name' ? t('forward.invalidName') : t('forward.invalidPhone')); setStep('input'); return
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
      if (e instanceof ApiError && e.status === 401) { onExpired(); return }
      setError(failText(e))
    } finally { busyRef.current = false; setBusy(false) }
  }

  // 직접 공유 결과 화면에서는 어떻게 닫든 서랍을 새로 불러온다(줄 상태가 바뀌었다)
  const dismiss = () => { if (step === 'shared') void onDone(); else onClose() }

  return (
    <Drawer anchor="bottom" open onClose={dismiss} slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } } }}>
      <Box sx={{ maxWidth: 480, mx: 'auto', width: '100%', px: 2, py: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('forward.title', { test: line.testName })}</Typography>
          {step === 'input' && (
            <>
              <TextField label={t('forward.name')} value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 20 } }} />
              <TextField label={t('forward.phone')} value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} slotProps={{ htmlInput: { inputMode: 'tel' } }} />
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
                <Button fullWidth variant="outlined" onClick={() => setStep('input')}>{t('forward.edit')}</Button>
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
          {info && <Alert severity="success">{info}</Alert>}
        </Stack>
      </Box>
    </Drawer>
  )
}
