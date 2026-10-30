import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Wordmark from '../components/Wordmark'
import { tokens } from '../theme/seorap'

// 기본 주소 시연용 구매자 인증 화면 (10-21). 서버를 부르지 않고, 인증번호도 보내지 않는다.
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length < 4) return d
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

export default function VerifyDemo() {
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState(false)
  const ready = /^010\d{8}$/.test(phone.replace(/\D/g, ''))

  return (
    <Box component="main" sx={{ minHeight: 'var(--frame-min-h)', px: 2, py: 4 }}>
      <Stack spacing={3}>
        <Wordmark />

        <Box sx={{ bgcolor: 'background.paper', borderRadius: tokens.radius.card, p: 3 }}>
          <Stack
            component="form"
            spacing={2.5}
            onSubmit={(e) => {
              e.preventDefault()
              if (ready) setSent(true)
            }}
          >
            <Stack spacing={1}>
              <Typography variant="h5" component="h1">
                스토어 구매자 인증
              </Typography>
              <Typography variant="body2" color="text.secondary">
                주문할 때 입력한 휴대폰 번호로 인증번호를 보내 드려요.
              </Typography>
            </Stack>
            <TextField
              id="phone"
              label="휴대폰 번호"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => {
                setPhone(formatPhone(e.target.value))
                setSent(false)
              }}
              slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'tel' } }}
              fullWidth
            />
            <Button type="submit" variant="contained" size="large" disabled={!ready} fullWidth>
              인증번호 받기
            </Button>
            {sent && (
              // MUI 기본 파랑(info) 대신 서랍 칩의 청록으로 칠한다
              <Alert icon={false} sx={{ bgcolor: tokens.tone.teal.bg, color: tokens.tone.teal.fg }}>시연용 화면이에요. 실제로 인증번호를 보내지 않아요.</Alert>
            )}
          </Stack>
        </Box>

        <Button component={RouterLink} to="/" variant="text" sx={{ alignSelf: 'center' }}>
          처음으로
        </Button>
      </Stack>
    </Box>
  )
}
