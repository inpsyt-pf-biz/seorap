import { Box, Stack, Typography } from '@mui/material'
import { t } from '@core/copy.ko.ts'
import { tokens } from '../theme/seorap'

// 로고 C1 (01-plan §0 10-29): 청록 서랍장 + 호박빛 얕은 곡선 손잡이, 모서리 22%. 카카오 프로필만 정사각, 화면은 라운드
function LogoMark({ size, onTeal }: { size: number; onTeal: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <rect data-part="logo-body" width="160" height="160" rx="35" fill={onTeal ? tokens.teal[500] : tokens.teal[700]} />
      <path data-part="logo-handle" d={tokens.brand.handlePath} fill="none" stroke={tokens.amber[500]} strokeWidth="12.5" strokeLinecap="round" />
    </svg>
  )
}

// onTeal: 닫힌 서랍 화면(청록 바탕)에 놓일 때. 로고 몸체를 밝히고 글자를 종이색으로 바꾼다
export default function Wordmark({ size = 'sm', onTeal = false }: { size?: 'sm' | 'lg'; onTeal?: boolean }) {
  const logo = size === 'lg' ? 96 : 40
  const word = size === 'lg' ? 34 : 20
  const ink = onTeal ? tokens.surface.page : tokens.teal[700]
  return (
    <Stack direction="row" spacing={1.5} role="img" aria-label={tokens.logo.alt} sx={{ alignItems: 'center' }}>
      <LogoMark size={logo} onTeal={onTeal} />
      <Stack spacing={0.5} sx={{ color: ink }}>
        <Typography variant="caption" sx={{ color: onTeal ? ink : 'text.secondary', lineHeight: 1 }}>{t('brand.parent')}</Typography>
        <Box component="svg" viewBox={tokens.brand.wordmarkViewBox} aria-hidden="true" focusable="false" sx={{ height: word, width: word * 1.9, display: 'block' }}>
          <path d={tokens.brand.wordmarkPath} fill="currentColor" />
        </Box>
      </Stack>
    </Stack>
  )
}
