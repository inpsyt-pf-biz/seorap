import { Box, Button, Stack, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { HelpResponse } from '@core/apiTypes.ts'
import { t } from '@core/copy.ko.ts'
import { defaultHelp } from '@core/helpContent.ts'
import HelpArticle from '../components/HelpArticle'
import Wordmark from '../components/Wordmark'
import { api } from '../lib/api'
import { tokens } from '../theme/seorap'

// 도움말 `/help` (build-spec §4-9). 세션 없이 누구나 연다.
// 내용은 상담 어드민에서 고친다(10-30). 불러오는 동안·실패하면 기본 질문 5개를 그대로 보인다(문의처는 받은 뒤에)
export default function HelpPage() {
  const navigate = useNavigate()
  const location = useLocation()
  // 서랍·입장 화면에서 왔으면 그 화면으로, 바로 열었으면(이전 화면 없음) 서랍으로 (10-30 검수: 돌아갈 길이 없음)
  const home = () => (location.key !== 'default' ? navigate(-1) : navigate('/box'))
  const [content, setContent] = useState(() => defaultHelp(''))
  // 옛 서버(문의처만 주는 판)와 화면이 엇갈려 배포된 순간에도 깨지지 않게, 질문 목록이 없으면 기본 질문 + 받은 문의처
  useEffect(() => {
    api<Partial<HelpResponse>>('help').then((r) => {
      setContent(Array.isArray(r.items) ? (r as HelpResponse) : defaultHelp(typeof r.contact === 'string' ? r.contact : ''))
    }).catch(() => {})
  }, [])

  return (
    <Box component="main" sx={{ maxWidth: tokens.layout.maxWidth, mx: 'auto', px: 2, py: 4 }}>
      <Stack spacing={3}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark />
          <Button variant="text" onClick={home}>{t('common.home')}</Button>
        </Stack>
        <Typography variant="h5">{t('help.title')}</Typography>
        <HelpArticle content={content} />
      </Stack>
    </Box>
  )
}
