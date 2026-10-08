import { Box, Stack, Typography } from '@mui/material'
import { CATEGORIES, categoryLabel, ordered, type Category } from '@counsel-core/centers.ts'
import { t } from '@counsel-core/copy.ko.ts'
import { categoryColors } from '../theme/admin'

export default function CategoryChips({ values }: { values: string[] }) {
  if (values.length === 0) return <Typography variant="body2" color="text.secondary">{t('center.empty')}</Typography>
  return (
    <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
      {ordered(values, CATEGORIES).map((v) => {
        const c = categoryColors[v as Category]
        return (
          <Box key={v} component="span" sx={{ px: 1.25, py: 0.25, borderRadius: 999, bgcolor: c?.bg, color: c?.fg }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>{categoryLabel(v)}</Typography>
          </Box>
        )
      })}
    </Stack>
  )
}
