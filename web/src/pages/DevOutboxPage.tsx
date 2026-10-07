import { Box, Button, Stack, Typography } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import type { DevOutboxItem } from '@core/apiTypes.ts'
import { formatKstDateTime } from '@core/time.ts'
import { api, ApiError } from '../lib/api'

// 로컬·미리보기 전용. 운영 빌드에서는 App.tsx가 이 경로를 만들지 않는다.
// 미리보기 함수는 키 머리글이 있어야 연다. 키는 Vercel Preview 환경값으로만 넣는다(이 번들은 Vercel 보호 뒤에 있다).
export default function DevOutboxPage() {
  const [items, setItems] = useState<DevOutboxItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    const key = import.meta.env.VITE_SEORAP_DEV_OUTBOX_KEY as string | undefined
    void api<{ items: DevOutboxItem[] }>('dev/outbox', undefined, key ? { headers: { 'X-Seorap-Dev-Key': key } } : undefined)
      .then((r) => { setItems(r.items); setError(null) })
      .catch((e) => setError(e instanceof ApiError ? e.code : 'UPSTREAM_FAILED'))
  }, [])
  useEffect(load, [load])
  return (
    <Box component="main" sx={{ maxWidth: 720, mx: 'auto', px: 2, py: 3 }}>
      <Stack spacing={1}>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6">dev outbox</Typography>
          <Button onClick={load}>refresh</Button>
        </Stack>
        {error && <Typography variant="body2" color="error">{`error: ${error}`}</Typography>}
        {items.map((i) => (
          <Box key={i.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
            <Typography variant="caption" color="text.secondary">{`${formatKstDateTime(i.createdAt)} · ${i.kind} · ****${i.toLast4}`}</Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{i.body}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
