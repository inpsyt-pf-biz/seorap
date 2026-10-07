import { Box, Button, Stack, Typography } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import type { DevOutboxItem } from '@core/apiTypes.ts'
import { formatKstDateTime } from '@core/time.ts'
import { api } from '../lib/api'

// 로컬·미리보기 전용. 운영 빌드에서는 App.tsx가 이 경로를 만들지 않는다.
export default function DevOutboxPage() {
  const [items, setItems] = useState<DevOutboxItem[]>([])
  const load = useCallback(() => { void api<{ items: DevOutboxItem[] }>('dev/outbox').then((r) => setItems(r.items)) }, [])
  useEffect(load, [load])
  return (
    <Box component="main" sx={{ maxWidth: 720, mx: 'auto', px: 2, py: 3 }}>
      <Stack spacing={1}>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6">dev outbox</Typography>
          <Button onClick={load}>refresh</Button>
        </Stack>
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
