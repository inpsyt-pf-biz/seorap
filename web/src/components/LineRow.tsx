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
// meta: 묶음 제목 없이 카드만 보일 때(1매 주문) 함께 보일 한 줄 (예: 구매일)
export default function LineRow({ line, meta, onAction }: { line: BoxLine; meta?: string; onAction: (a: LineAction, line: BoxLine) => void }) {
  const tone = tokens.tone[TONE[line.status.tone]]
  // 주 행동은 자리가 아니라 의미로 정한다 (10-30 비평 ③): 하러 온 일(실시·이어서)만 옅은 청록(soft),
  // 이미 한 일(결과 보기)은 글자 버튼으로 낮추고, 넘기는 일(전달·다시 보내기·다른 분께)과 꺼진 버튼은 테두리
  const variantOf = (a: LineAction): 'soft' | 'text' | 'outlined' =>
    a === 'launch' || a === 'continue' ? 'soft' : a === 'result' || a === 'result_help' ? 'text' : 'outlined'
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: tokens.radius.card, p: 1.5, bgcolor: 'background.paper' }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>{line.testName}</Typography>
            {meta && <Typography variant="body2" color="text.secondary">{meta}</Typography>}
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
            {line.status.actions.map((a) => (
              <Button key={a} fullWidth variant={variantOf(a)} onClick={() => onAction(a, line)}>
                {t(`action.${a}` as CopyKey)}
              </Button>
            ))}
          </Stack>
        )}
        {/* 아직 쓸 수 없는 버튼 (상담 신청서 제출 전 실시하기·전달하기). 같은 자리·모양으로 꺼진 채 보여 무엇이 열릴지 알린다 */}
        {line.status.actions.length === 0 && (line.status.disabled ?? []).length > 0 && (
          <Stack direction="row" spacing={1}>
            {line.status.disabled!.map((a) => (
              <Button key={a} fullWidth disabled variant="outlined">
                {t(`action.${a}` as CopyKey)}
              </Button>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  )
}
