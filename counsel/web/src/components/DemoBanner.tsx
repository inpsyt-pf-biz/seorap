import { Box, Typography } from '@mui/material'
import { t } from '@counsel-core/copy.ko.ts'
import { tokens } from '../theme/admin'

// 모든 화면 위에 고정한다. 완성품이 아니고 실제 정보를 넣으면 안 된다는 표시.
export default function DemoBanner() {
  return (
    <Box sx={{ bgcolor: tokens.brand[900], color: tokens.surface[0], py: 0.5, textAlign: 'center' }}>
      <Typography variant="caption">{t('app.demoBanner')}</Typography>
    </Box>
  )
}
