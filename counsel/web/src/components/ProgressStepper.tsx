import { Alert, Box, Stack, Tooltip, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import PriorityHighIcon from '@mui/icons-material/PriorityHigh'
import { formatKstMonthDay } from '@seorap-core/time.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { stepLabel, type Progress, type Step } from '@counsel-core/progress.ts'

// 단계 동그라미 모양: 끝남(채움+체크) / 지금(테두리 굵게) / 아직(회색 테두리) / 누락(빨강+느낌표) / 멈춤(회색+×) / 쓸 수 없음(점선)
const DOT = 28
function Dot({ step }: { step: Step }) {
  const sx = { width: DOT, height: DOT, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' as const }
  switch (step.state) {
    case 'done': return <Box sx={{ ...sx, bgcolor: 'primary.main', color: 'primary.contrastText' }}><CheckIcon sx={{ fontSize: 18 }} /></Box>
    case 'current': return <Box sx={{ ...sx, border: 3, borderColor: 'primary.main', bgcolor: 'background.paper' }} />
    case 'missing': return <Box sx={{ ...sx, bgcolor: 'error.main', color: 'error.contrastText' }}><PriorityHighIcon sx={{ fontSize: 18 }} /></Box>
    case 'stopped': return <Box sx={{ ...sx, bgcolor: 'action.disabledBackground', color: 'text.secondary' }}><CloseIcon sx={{ fontSize: 16 }} /></Box>
    case 'pending': return <Box sx={{ ...sx, border: 2, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper' }} />
    default: return <Box sx={{ ...sx, border: 2, borderColor: 'divider', bgcolor: 'background.paper' }} />
  }
}

const labelColor = (s: Step['state']) =>
  s === 'done' || s === 'current' ? 'primary.main' : s === 'missing' ? 'error.main' : 'text.secondary'

// 진행 단계 표시줄과 '지금 할 일' 한 줄. 단계 이름에 마우스를 올리면 그 단계가 무엇인지 보인다.
export default function ProgressStepper({ progress, title }: { progress: Progress; title?: string }) {
  const { steps, next } = progress
  const severity = next.key === 'progress.next.missing' ? 'warning' : next.key === 'progress.next.done' ? 'success' : 'info'
  return (
    <Stack spacing={1.5}>
      {title && <Typography variant="subtitle2" color="text.secondary">{title}</Typography>}
      <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(84px, 1fr))`, minWidth: steps.length * 84 }}>
          {steps.map((s, i) => (
            <Box key={s.key} sx={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              {i > 0 && (
                <Box sx={{
                  position: 'absolute', top: DOT / 2 - 1, right: '50%', width: '100%', height: 2, zIndex: 0,
                  bgcolor: s.state === 'done' && steps[i - 1].state === 'done' ? 'primary.main' : 'divider',
                }} />
              )}
              <Box sx={{ position: 'relative', zIndex: 1 }}><Dot step={s} /></Box>
              <Tooltip title={t(`progress.hint.${s.key}` as CopyKey)} arrow>
                <Typography variant="body2" sx={{ mt: 0.75, fontWeight: s.state === 'current' || s.state === 'missing' ? 700 : 500, color: labelColor(s.state), cursor: 'help' }}>
                  {stepLabel(s.key)}
                </Typography>
              </Tooltip>
              <Typography variant="caption" color={s.state === 'missing' ? 'error.main' : 'text.secondary'} sx={{ minHeight: 18 }}>
                {s.state === 'missing'
                  ? [t('progress.state.missing'), s.note].filter(Boolean).join(' · ')
                  : s.note ?? (s.at ? formatKstMonthDay(s.at) : '')}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
      <Alert severity={severity} icon={false} sx={{ py: 0.5 }}>
        <Typography variant="body2"><Box component="span" sx={{ fontWeight: 700, mr: 1 }}>{t('progress.nextLabel')}</Box>{t(next.key, next.vars)}</Typography>
      </Alert>
    </Stack>
  )
}
