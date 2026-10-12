import { Box, Stack, Typography } from '@mui/material'
import { SPECIALTIES, ordered, specialtyLabel, type Specialty } from '@counsel-core/centers.ts'
import { t } from '@counsel-core/copy.ko.ts'
import { specialtyColors } from '../theme/admin'

export default function SpecialtyChips({ values }: { values: string[] }) {
  if (values.length === 0) return <Typography variant="body2" color="text.secondary">{t('center.empty')}</Typography>
  return (
    <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
      {ordered(values, SPECIALTIES).map((v) => {
        const c = specialtyColors[v as Specialty]
        return (
          <Box key={v} component="span" sx={{ px: 1.25, py: 0.25, borderRadius: 999, bgcolor: c?.bg, color: c?.fg }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>{specialtyLabel(v)}</Typography>
          </Box>
        )
      })}
    </Stack>
  )
}
