import { Box, Stack, Typography } from '@mui/material'
import { t } from '@core/copy.ko.ts'
import { tokens } from '../theme/seorap'

export default function Wordmark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const img = size === 'lg' ? 120 : 40
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <Box component="img" src={tokens.logo.src} alt={tokens.logo.alt} sx={{ width: img, height: img }} />
      <Stack>
        <Typography variant="caption" color="text.secondary">{t('brand.parent')}</Typography>
        <Typography variant={size === 'lg' ? 'h4' : 'h6'} sx={{ color: tokens.seorapAccent, lineHeight: 1.1 }}>{t('brand.name')}</Typography>
      </Stack>
    </Stack>
  )
}
