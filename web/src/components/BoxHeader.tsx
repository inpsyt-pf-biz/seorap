import { Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material'
import { t } from '@core/copy.ko.ts'
import { tokens } from '../theme/seorap'
import Wordmark from './Wordmark'

// 서랍 안 화면(내 검사·전달 이력)의 머리 판. 닫힌 서랍의 앞판(청록)이 위에 남고 그 아래로 서랍이 열린다.
// 누구의 서랍인지·몇 매 남았는지·어느 탭인지를 한 덩어리로 묶는다 (10-29 검수: 요소가 시각적으로 묶이지 않음,
// impeccable layout: 근접으로 묶고, 작업 화면은 색을 칠한 틀로). 탭 표시는 로고 손잡이와 같은 호박빛
// 요약 줄(실시 전 N매)은 내 검사 탭 아래 내용에 둔다. 머리 판 높이가 탭마다 같아야 오갈 때 화면이 튀지 않는다 (10-30 검수)
export default function BoxHeader({ ownerName, tab, onTab, onLogout }: {
  ownerName?: string | null; tab: 0 | 1; onTab: (v: 0 | 1) => void; onLogout: () => void
}) {
  return (
    <Box
      data-region="shell"
      sx={{ bgcolor: tokens.teal[700], color: tokens.surface.page, px: 2, pt: 3, '--seorap-focus': tokens.focus.onTeal }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Wordmark onTeal />
        <Button variant="text" onClick={onLogout} sx={{ color: tokens.surface.page }}>{t('box.logout')}</Button>
      </Stack>
      <Stack spacing={0.5} sx={{ mt: 3, mb: 2 }}>
        {ownerName && <Typography variant="h4">{t('box.title', { name: ownerName })}</Typography>}
      </Stack>
      <Tabs
        value={tab}
        onChange={(_, v) => onTab(v)}
        slotProps={{ indicator: { style: { backgroundColor: tokens.amber[500], height: 3 } } }}
        sx={{
          '& .MuiTab-root': { color: tokens.teal[100], px: 0, mr: 3, minWidth: 0, fontWeight: 500 },
          '& .MuiTab-root.Mui-selected': { color: tokens.surface.page },
        }}
      >
        <Tab label={t('box.tab.mine')} />
        <Tab label={t('box.tab.history')} />
      </Tabs>
    </Box>
  )
}
