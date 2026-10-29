import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { useRef, useState } from 'react'
import { t } from '@core/copy.ko.ts'

// 코드 보기 창. 코드는 PC 에서 옮겨 적을 값이라 크게(고정폭) 보이고 [코드 복사]를 주 버튼으로 둔다 (UX 진단 R4).
// 복사가 막힌 브라우저(일부 인앱 브라우저)에서는 코드를 선택해 두고 길게 눌러 복사하라고 안내한다
export default function CodeDialog({ code, onClose, onCopied }: { code: string | null; onClose: () => void; onCopied: () => void }) {
  const [failed, setFailed] = useState(false)
  const codeRef = useRef<HTMLParagraphElement | null>(null)

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      onCopied()
    } catch {
      // 클립보드 API 가 없거나 막힌 인앱 브라우저: 코드를 선택해 예전 방식(execCommand)으로 한 번 더 복사해 본다
      const sel = window.getSelection()
      if (sel && codeRef.current) sel.selectAllChildren(codeRef.current)
      let ok = false
      try { ok = typeof document.execCommand === 'function' && document.execCommand('copy') } catch { ok = false }
      if (ok) onCopied()
      else setFailed(true)
    }
  }
  const close = () => { setFailed(false); onClose() }

  return (
    <Dialog open={code !== null} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>{t('code.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography
            ref={codeRef} component="p" variant="h5"
            sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', letterSpacing: '0.02em', userSelect: 'all' }}
          >
            {code}
          </Typography>
          <Typography variant="body2" color="text.secondary">{t('code.pcNote')}</Typography>
          {failed && <Typography variant="body2" role="status">{t('code.copyFailed')}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={close}>{t('common.close')}</Button>
        <Button variant="contained" onClick={copy}>{t('code.copy')}</Button>
      </DialogActions>
    </Dialog>
  )
}
