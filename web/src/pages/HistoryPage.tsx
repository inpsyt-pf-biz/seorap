import { Alert, Box, Chip, Stack, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { HistoryItem, HistoryResponse } from '@core/apiTypes.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import { formatKstDateTime } from '@core/time.ts'
import BoxFloor from '../components/BoxFloor'
import BoxHeader from '../components/BoxHeader'
import { api, isSessionEnd } from '../lib/api'
import { tokens } from '../theme/seorap'
import StatePage from './StatePage'

type Tone = keyof typeof tokens.tone
// 한 건 = 누구에게(제목) · 결과(칩) / 무슨 검사 · 표시 / 언제. 한 문장으로 잇지 않고 줄을 나눠 훑기 쉽게 (UX 진단 F5)
function head(i: HistoryItem): { title: string; chip: string | null; tone: Tone } {
  if (i.action === 'direct_share') return { title: t('history.direct'), chip: t('history.directNote'), tone: 'neutral' }
  if (i.action === 'cancel') return { title: t('history.cancel', { name: i.toName ?? '' }), chip: null, tone: 'neutral' }
  const chip = i.result ? t(`history.result.${i.result}` as CopyKey) : t('history.result.sending')
  const tone: Tone = i.result === 'failed' ? 'caution' : i.result ? 'teal' : 'neutral'
  return { title: t('history.line', { name: i.toName ?? '', phone: i.toPhone ?? '' }), chip, tone }
}

export default function HistoryPage() {
  const navigate = useNavigate()
  // 서랍 화면에서 탭으로 넘어오면 주인 이름을 받는다. 새로 열었으면 없다(제목만 생략)
  const ownerName = (useLocation().state as { ownerName?: string } | null)?.ownerName ?? null
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [expired, setExpired] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api<HistoryResponse>('history').then((r) => setItems(r.items)).catch((e) => {
      if (isSessionEnd(e)) setExpired(true)
      else setFailed(true)
    })
  }, [])


  if (expired) return <StatePage kind="sessionExpired" />
  return (
    <Box component="main" sx={{ maxWidth: tokens.layout.maxWidth, mx: 'auto' }}>
      <BoxHeader ownerName={ownerName} tab={1} onTab={(v) => v === 0 && navigate('/box')} onSettings={() => navigate('/box/settings')} />
      <Stack data-region="content" spacing={2} sx={{ px: 2, pt: 3, pb: 5 }}>
        {failed && <Alert severity="warning">{t('error.generic')}</Alert>}
        {items && items.length === 0 && <Typography variant="body1" color="text.secondary">{t('history.empty')}</Typography>}
        {items && items.length > 0 && (
          <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {items.map((i) => {
              const h = head(i)
              const tone = tokens.tone[h.tone]
              const marks = [i.action === 'resend' ? t('history.resendMark') : null, i.openedAt ? t('history.opened') : null].filter((m): m is string => !!m)
              return (
                <Box component="li" key={i.id} sx={{ border: 1, borderColor: 'divider', borderRadius: tokens.radius.card, p: 1.5, bgcolor: 'background.paper' }}>
                  <Stack spacing={0.5}>
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography variant="body1" sx={{ fontWeight: 500, minWidth: 0 }}>{h.title}</Typography>
                      {h.chip && <Chip size="small" label={h.chip} sx={{ flexShrink: 0, bgcolor: tone.bg, color: tone.fg }} />}
                    </Stack>
                    <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                      <Typography variant="body2">{t('history.unit', { test: i.testName, n: i.unitNo })}</Typography>
                      {marks.map((m) => <Typography key={m} variant="body2" color="text.secondary">{m}</Typography>)}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">{formatKstDateTime(i.at)}</Typography>
                  </Stack>
                </Box>
              )
            })}
          </Stack>
        )}
        <BoxFloor />
      </Stack>
    </Box>
  )
}
