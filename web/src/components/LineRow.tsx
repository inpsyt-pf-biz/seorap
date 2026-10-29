import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import type { BoxLine } from '@core/apiTypes.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import type { LineAction, LineTone } from '@core/lineStatus.ts'
import { tokens } from '../theme/seorap'

// 줄 상태 톤 → 서랍 칩 색 (MUI 기본 info·warning 은 대비가 모자라 쓰지 않는다. UX 진단 F1·F2)
const TONE: Record<LineTone, keyof typeof tokens.tone> = {
  neutral: 'neutral', info: 'teal', success: 'teal', warning: 'caution', muted: 'muted', warm: 'warm',
}

// [코드 보기]는 두지 않는다 (10-29 검수: 실시하기가 새 창으로 검사를 바로 연다)
export default function LineRow({ line, onAction }: { line: BoxLine; onAction: (a: LineAction, line: BoxLine) => void }) {
  const tone = tokens.tone[TONE[line.status.tone]]
  // 줄마다 마지막 버튼이 주 행동이다. 진한 채움 대신 옅은 청록(soft)으로 해, 여러 줄이 쌓여도 화면이 무겁지 않게 한다 (UX 진단 R2)
  const variantAt = (i: number, n: number, a?: LineAction) => (i === n - 1 && a !== 'contact' ? 'soft' : 'outlined')
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: tokens.radius.card, p: 1.5, bgcolor: 'background.paper' }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>{line.testName}</Typography>
            {line.unitsOfTest > 1 && (
              <Typography variant="body2" color="text.secondary">{t('line.unit', { n: line.unitsOfTest, k: line.unitNo })}</Typography>
            )}
          </Box>
          <Chip
            size="small" label={line.status.label} data-tone={TONE[line.status.tone]}
            sx={{ flexShrink: 0, bgcolor: tone.bg, color: tone.fg, ...('border' in tone ? { border: `1px solid ${tone.border}` } : {}) }}
          />
        </Stack>
        {line.forwardTo && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
            <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{t('line.forwardTo')}</Typography>
            <Typography variant="body2">{`${line.forwardTo.name} ${line.forwardTo.phone}`}</Typography>
          </Stack>
        )}
        {line.status.note && <Typography variant="body2" color="text.secondary">{line.status.note}</Typography>}
        {line.status.actions.length > 0 && (
          <Stack direction="row" spacing={1}>
            {line.status.actions.map((a, i) => (
              <Button key={a} fullWidth variant={variantAt(i, line.status.actions.length, a)} onClick={() => onAction(a, line)}>
                {t(`action.${a}` as CopyKey)}
              </Button>
            ))}
          </Stack>
        )}
        {/* 아직 쓸 수 없는 버튼 (상담 신청서 제출 전 실시하기·전달하기). 같은 자리·모양으로 꺼진 채 보여 무엇이 열릴지 알린다 */}
        {line.status.actions.length === 0 && (line.status.disabled ?? []).length > 0 && (
          <Stack direction="row" spacing={1}>
            {line.status.disabled!.map((a, i) => (
              <Button key={a} fullWidth disabled variant={variantAt(i, line.status.disabled!.length)}>
                {t(`action.${a}` as CopyKey)}
              </Button>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  )
}
