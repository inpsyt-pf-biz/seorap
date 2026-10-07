import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import type { BoxLine } from '@core/apiTypes.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import type { LineAction, LineTone } from '@core/lineStatus.ts'

const CHIP: Record<LineTone, 'default' | 'info' | 'success' | 'warning'> = {
  neutral: 'default', info: 'info', success: 'success', warning: 'warning', muted: 'default',
}

export default function LineRow({ line, onAction }: { line: BoxLine; onAction: (a: LineAction | 'code', line: BoxLine) => void }) {
  // 코드를 직접 볼 수 있는 줄: 실시하기·이어서 하기·결과 보기가 있는 줄 (모두 플랫폼 검사 주소를 여는 동작)
  const canCode = line.status.actions.some((a) => a === 'launch' || a === 'continue' || a === 'result')
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, bgcolor: 'background.paper' }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>{line.testName}</Typography>
            {line.unitsOfTest > 1 && (
              <Typography variant="body2" color="text.secondary">{t('line.unit', { n: line.unitsOfTest, k: line.unitNo })}</Typography>
            )}
          </Box>
          <Chip size="small" label={line.status.label} color={CHIP[line.status.tone]} variant={line.status.tone === 'muted' ? 'outlined' : 'filled'} />
        </Stack>
        {line.forwardTo && <Typography variant="body2" color="primary">{`→ ${line.forwardTo.name} · ${line.forwardTo.phone}`}</Typography>}
        {line.status.note && <Typography variant="body2" color="text.secondary">{line.status.note}</Typography>}
        {line.status.actions.length > 0 && (
          <Stack direction="row" spacing={1}>
            {line.status.actions.map((a, i) => (
              <Button key={a} fullWidth variant={i === line.status.actions.length - 1 && a !== 'contact' ? 'contained' : 'outlined'} onClick={() => onAction(a, line)}>
                {t(`action.${a}` as CopyKey)}
              </Button>
            ))}
          </Stack>
        )}
        {canCode && (
          <Button variant="text" size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => onAction('code', line)}>{t('action.code')}</Button>
        )}
      </Stack>
    </Box>
  )
}
