import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Stack, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { HelpResponse } from '@core/apiTypes.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import Wordmark from '../components/Wordmark'
import { api } from '../lib/api'
import { tokens } from '../theme/seorap'

// 도움말 `/help` (build-spec §4-9). 세션 없이 누구나 연다. 문의처는 설정값
const ITEMS: [CopyKey, CopyKey][] = [
  ['help.q.noSms', 'help.a.noSms'],
  ['help.q.lostLink', 'help.a.lostLink'],
  ['help.q.cancel', 'help.a.cancel'],
  ['help.q.result', 'help.a.result'],
  ['help.q.scam', 'help.a.scam'],
]

export default function HelpPage() {
  const navigate = useNavigate()
  const location = useLocation()
  // 서랍·입장 화면에서 왔으면 그 화면으로, 바로 열었으면(이전 화면 없음) 서랍으로 (10-30 검수: 돌아갈 길이 없음)
  const home = () => (location.key !== 'default' ? navigate(-1) : navigate('/box'))
  const [contact, setContact] = useState<string | null>(null)
  // 문의처를 못 불러와도 도움말 본문은 그대로 보인다
  useEffect(() => { api<HelpResponse>('help').then((r) => setContact(r.contact)).catch(() => {}) }, [])

  return (
    <Box component="main" sx={{ maxWidth: tokens.layout.maxWidth, mx: 'auto', px: 2, py: 4 }}>
      <Stack spacing={3}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark />
          <Button variant="text" onClick={home}>{t('common.home')}</Button>
        </Stack>
        <Typography variant="h5">{t('help.title')}</Typography>
        <Box>
          {ITEMS.map(([q, a]) => (
            <Accordion key={q} disableGutters elevation={0}>
              <AccordionSummary><Typography variant="body1">{t(q)}</Typography></AccordionSummary>
              <AccordionDetails><Typography variant="body2" color="text.secondary">{t(a)}</Typography></AccordionDetails>
            </Accordion>
          ))}
        </Box>
        {contact && <Typography variant="body2" color="text.secondary">{contact}</Typography>}
      </Stack>
    </Box>
  )
}
