import { Fragment } from 'react'
import { Box, ButtonBase, Chip, Stack, Typography } from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { STAGES, STAGE_EXITS, STAGE_TEST_ONLY, STAGE_TODO, stageKey, type StageCounts } from '@counsel-core/purchases.ts'
import { tokens } from '../theme/admin'

// 구매 건 목록 위의 진행 단계 줄. 단계 칸을 누르면 그 단계에 머문 건만, 칸 아래 작은 배지(불가·취소)를 누르면
// 그 단계에서 빠진 건만 남는다. 같은 것을 다시 누르면 전체로 돌아간다. 맨 앞의 '할 일'은 본사가 손댈 건만 급한 순서로.
type Props = { counts: StageCounts; value: string; onChange: (value: string) => void }

export default function StageStrip({ counts, value, onChange }: Props) {
  const pick = (v: string) => onChange(value === v ? '' : v)
  return (
    <Stack spacing={1.25}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Chip clickable title={t('purchases.stage.todoHelp')} onClick={() => pick(STAGE_TODO)}
          color={value === STAGE_TODO ? 'primary' : 'default'} variant={value === STAGE_TODO ? 'filled' : 'outlined'}
          sx={value === STAGE_TODO || counts.todo === 0 ? undefined : { borderColor: tokens.tone.caution.fg, color: tokens.tone.caution.fg, fontWeight: 600 }}
          label={t('purchases.stage.todo', { n: counts.todo })} />
        <Chip clickable label={t('purchases.summary.all', { n: counts.all })} color={value === '' ? 'primary' : 'default'}
          variant={value === '' ? 'filled' : 'outlined'} onClick={() => onChange('')} />
        {counts.testOnly > 0 && (
          <Chip clickable label={t('purchases.summary.testOnly', { n: counts.testOnly })} title={t('purchases.summary.testOnlyHelp')}
            color={value === STAGE_TEST_ONLY ? 'primary' : 'default'} variant={value === STAGE_TEST_ONLY ? 'filled' : 'outlined'}
            onClick={() => pick(STAGE_TEST_ONLY)} />
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>{t('purchases.stage.help')}</Typography>
      </Stack>
      <Box role="group" aria-label={t('purchases.stage.label')} sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5, overflowX: 'auto', pb: 0.5 }}>
        {STAGES.map((s, i) => {
          const on = value === s
          return (
            <Fragment key={s}>
              {i > 0 && <ChevronRightIcon aria-hidden sx={{ alignSelf: 'center', flexShrink: 0, color: tokens.text.disabled, fontSize: 20, mt: -2.5 }} />}
              <Box sx={{ flex: '1 0 120px', minWidth: 120 }}>
                <ButtonBase aria-pressed={on} onClick={() => pick(s)} sx={{
                  width: '100%', display: 'block', textAlign: 'left', px: 1.75, py: 1.25, borderRadius: tokens.radius.card,
                  border: `1px solid ${on ? tokens.teal[500] : tokens.surface[200]}`, boxShadow: on ? `inset 0 0 0 1px ${tokens.teal[500]}` : 'none',
                  bgcolor: on ? tokens.teal[100] : tokens.surface[0],
                }}>
                  <Typography variant="caption" color={on ? tokens.teal[900] : 'text.secondary'} component="div">{t(`purchases.stage.${s}` as CopyKey)}</Typography>
                  <Typography variant="h6" component="div" sx={{ fontWeight: 600, color: on ? tokens.teal[900] : 'text.primary' }}>{counts.stage[s]}</Typography>
                </ButtonBase>
                <Stack direction="row" sx={{ gap: 0.5, mt: 0.75, minHeight: 24, flexWrap: 'wrap' }}>
                  {STAGE_EXITS.filter((e) => counts.exit[s][e] > 0).map((e) => {
                    const key = stageKey(s, e)
                    const picked = value === key
                    return (
                      <Chip key={e} size="small" clickable label={t(`purchases.stage.exit.${e}` as CopyKey, { n: counts.exit[s][e] })}
                        color={e === 'unable' ? 'warning' : 'default'} variant={picked ? 'filled' : 'outlined'} onClick={() => pick(key)} />
                    )
                  })}
                </Stack>
              </Box>
            </Fragment>
          )
        })}
      </Box>
    </Stack>
  )
}
