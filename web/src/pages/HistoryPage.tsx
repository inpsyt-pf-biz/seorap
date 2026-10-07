import { Alert, Box, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HistoryItem, HistoryResponse } from '@core/apiTypes.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import { formatKstDateTime } from '@core/time.ts'
import Wordmark from '../components/Wordmark'
import { api, ApiError } from '../lib/api'
import StatePage from './StatePage'

function lineText(i: HistoryItem): string {
  const at = formatKstDateTime(i.at)
  if (i.action === 'direct_share') return t('history.direct', { at })
  if (i.action === 'cancel') return t('history.cancel', { at, name: i.toName ?? '' })
  const result = i.result ? t(`history.result.${i.result}` as CopyKey) : t('history.result.sending')
  return t('history.line', { name: i.toName ?? '', phone: i.toPhone ?? '', at, result })
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [expired, setExpired] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api<HistoryResponse>('history').then((r) => setItems(r.items)).catch((e) => {
      if (e instanceof ApiError && e.status === 401) setExpired(true)
      else setFailed(true)
    })
  }, [])

  if (expired) return <StatePage kind="sessionExpired" />
  return (
    <Box component="main" sx={{ maxWidth: 480, mx: 'auto', px: 2, py: 3 }}>
      <Stack spacing={2}>
        <Wordmark />
        <Tabs value={1} onChange={(_, v) => v === 0 && navigate('/box')}>
          <Tab label={t('box.tab.mine')} />
          <Tab label={t('box.tab.history')} />
        </Tabs>
        {failed && <Alert severity="warning">{t('error.generic')}</Alert>}
        {items && items.length === 0 && <Typography variant="body1" color="text.secondary">{t('history.empty')}</Typography>}
        {items?.map((i) => (
          <Box key={i.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, bgcolor: 'background.paper' }}>
            <Typography variant="body1">{lineText(i)}</Typography>
            <Typography variant="body2" color="text.secondary">
              {[`${i.testName} ${i.unitNo}`, i.action === 'resend' ? t('history.resendMark') : null, i.openedAt ? t('history.opened') : null].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
