import { Alert, Box, Button, Drawer, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import type { BoxLine, DirectShareResponse } from '@core/apiTypes.ts'
import { t } from '@core/copy.ko.ts'
import { api, ApiError, isSessionEnd } from '../lib/api'
import { failText } from '../lib/failText'
import { loadKakao, sendKakao } from '../lib/kakao'
import { tokens } from '../theme/seorap'
import Choice from './Choice'

// 전달 시트 (10-30 전달 방식 개선, Works-archive native-share-design.md)
// 받는 분 번호를 외워 입력하기 어렵다 → 번호 입력을 없애고 버튼 두 개: [카카오톡으로 전달]·[직접 전달](휴대폰 공유 창).
// 둘 다 서버가 번호 없는 링크를 만든다(forward/direct). 호칭은 검사별 목록에서 고르거나 직접 입력(선택)해 이력에 남긴다.
type Via = 'kakao' | 'native'
type Step = 'choose' | 'kakao' | 'native' | 'copied'
type Made = DirectShareResponse & { label: string | null }
const CUSTOM = '__custom__'

export default function ForwardSheet({ line, onClose, onDone, onExpired }: {
  line: BoxLine | null; onClose: () => void; onDone: (message?: string) => void | Promise<void>; onExpired: () => void
}) {
  const [prevLine, setPrevLine] = useState(line)
  const [step, setStep] = useState<Step>('choose')
  const [picked, setPicked] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const [labelError, setLabelError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 만든 링크. 공유 창·카카오를 다시 열 때 새로 만들지 않고 이것을 쓴다(원문 링크는 서버에 남지 않는다)
  const [made, setMade] = useState<Made | null>(null)
  const [copied, setCopied] = useState(true)
  const [busy, setBusy] = useState(false)
  const [kakaoOn, setKakaoOn] = useState(false)
  // state 는 화면이 다시 그려져야 바뀌므로, 그 전에 들어오는 두 번째 탭은 ref 로 막는다
  const busyRef = useRef(false)

  useEffect(() => { void loadKakao().then(setKakaoOn) }, [])

  // 시트가 새 줄로 열리면 처음 상태로. 렌더 중에 맞춰야 이전 고르기가 한 프레임도 비치지 않는다.
  if (prevLine !== line) {
    setPrevLine(line)
    setStep('choose'); setPicked(null); setCustom(''); setLabelError(false); setError(null); setMade(null)
  }
  if (!line) return null

  const sentText = (label: string | null) => (label ? t('forward.sharedTo', { name: label }) : t('forward.shared'))

  // 휴대폰 공유 창. 취소하거나 브라우저가 막으면(서버를 거친 뒤라 누른 순간이 지났을 수 있다) 같은 링크로 다시 열게 한다.
  // 공유 창이 없는 PC 는 복사.
  const openNative = async (m: Made) => {
    if (typeof navigator.share !== 'function') {
      let ok = true
      try { await navigator.clipboard.writeText(m.text) } catch { ok = false }
      setCopied(ok); setStep('copied'); return
    }
    try {
      await navigator.share({ text: m.text })
      await onDone(sentText(m.label))
    } catch {
      setStep('native')
    }
  }
  // 카카오는 보냈는지 알려 주지 않는다. 열어 두고, 안 열렸으면 [카카오톡 다시 열기], 다 보냈으면 [다 보냈어요]
  const openKakao = (m: Made) => {
    try { sendKakao({ text: m.kakaoText, url: m.url, buttonTitle: t('forward.kakao.button') }) } catch { /* 다시 열기로 */ }
    setStep('kakao')
  }

  const deliver = async (via: Via) => {
    if (busyRef.current) return
    let label: string | null = picked
    if (picked === CUSTOM) {
      label = custom.trim()
      if (label.length < 1 || label.length > 20) { setLabelError(true); return }
    }
    busyRef.current = true
    setBusy(true); setError(null)
    try {
      const r = await api<DirectShareResponse>('forward/direct', { voucherId: line.voucherId, clientRequestId: crypto.randomUUID(), label, via })
      const m = { ...r, label }
      setMade(m)
      if (via === 'kakao') openKakao(m)
      else await openNative(m)
    } catch (e) {
      if (isSessionEnd(e)) { onExpired(); return }
      // 그사이 줄 상태가 바뀌었다. 막다른 화면 대신 시트를 닫고 서랍을 새로 불러 진짜 상태를 보인다.
      if (e instanceof ApiError && e.code === 'CONFLICT') { await onDone(); return }
      if (e instanceof ApiError && e.code === 'VALIDATION' && e.extra.field === 'label') { setPicked(CUSTOM); setLabelError(true); return }
      setError(failText(e))
    } finally { busyRef.current = false; setBusy(false) }
  }

  // 링크를 만든 뒤에는 어떻게 닫든 서랍을 새로 불러온다(줄 상태가 바뀌었다)
  const dismiss = () => { if (made) void onDone(); else onClose() }
  // 바깥을 누르거나 Esc 를 눌러도 처리 중에는 닫지 않는다
  const dismissIfIdle = () => { if (!busyRef.current) dismiss() }

  const pick = (v: string) => { setPicked((p) => (p === v ? null : v)); setLabelError(false) }

  return (
    // 시트는 브라우저 전체 폭이 아니라 주 컬럼 폭 안에서 가운데에 놓인다 (폰에서는 꽉 찬다)
    <Drawer
      anchor="bottom" open onClose={dismissIfIdle}
      slotProps={{ paper: { sx: { width: '100%', maxWidth: tokens.layout.maxWidth, left: 0, right: 0, mx: 'auto', borderTopLeftRadius: 16, borderTopRightRadius: 16 } } }}
    >
      <Box sx={{ px: 2, py: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('forward.title', { test: line.testName })}</Typography>
          {step === 'choose' && (
            <>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>{t('forward.to')}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                {line.recipientLabels.map((l) => <Choice key={l} selected={picked === l} onClick={() => pick(l)}>{l}</Choice>)}
                <Choice selected={picked === CUSTOM} onClick={() => pick(CUSTOM)}>{t('forward.custom')}</Choice>
              </Box>
              {picked === CUSTOM && (
                <TextField
                  label={t('forward.customLabel')} value={custom} autoFocus slotProps={{ htmlInput: { maxLength: 20 } }}
                  error={labelError} helperText={labelError ? t('forward.invalidLabel') : undefined}
                  onChange={(e) => { setCustom(e.target.value); setLabelError(false) }}
                />
              )}
              {/* 공유한 링크가 퍼지는 것은 막지 않는다. 대신 보내기 전에 알린다 (01-plan §0 10-28) */}
              <Alert severity="info">{t('forward.caution')}</Alert>
              {kakaoOn && <Button variant="contained" size="large" disabled={busy} onClick={() => deliver('kakao')}>{t('forward.kakao')}</Button>}
              <Button variant={kakaoOn ? 'outlined' : 'contained'} size="large" disabled={busy} onClick={() => deliver('native')}>{t('forward.native')}</Button>
            </>
          )}
          {step === 'kakao' && made && (
            <>
              <Typography variant="body1">{t('forward.kakao.ready')}</Typography>
              <Button variant="outlined" onClick={() => openKakao(made)}>{t('forward.kakao.again')}</Button>
              <Button variant="contained" size="large" onClick={() => onDone(sentText(made.label))}>{t('forward.kakao.done')}</Button>
            </>
          )}
          {step === 'native' && made && (
            <>
              <Typography variant="body1">{t('forward.native.ready')}</Typography>
              <Button variant="contained" size="large" onClick={() => openNative(made)}>{t('forward.native.again')}</Button>
              <Button variant="outlined" onClick={dismiss}>{t('common.close')}</Button>
            </>
          )}
          {step === 'copied' && made && (
            <>
              {/* 복사가 막힌 환경이면 문구를 그대로 보여 직접 길게 눌러 복사하게 한다 */}
              {copied
                ? <Alert severity="success">{t('forward.direct.copied')}</Alert>
                : <Alert severity="info" sx={{ wordBreak: 'break-all', userSelect: 'all' }}>{made.text}</Alert>}
              <Button fullWidth variant="contained" onClick={dismiss}>{t('common.close')}</Button>
            </>
          )}
          {error && <Alert severity="warning">{error}</Alert>}
        </Stack>
      </Box>
    </Drawer>
  )
}
