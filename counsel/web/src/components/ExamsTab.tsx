import { Box, Button, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import { formatKstMonthDay } from '@seorap-core/time.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { examStatusLabel, examSummary, liveTests } from '@counsel-core/exams.ts'
import type { PurchaseDetail } from '../lib/api'

const CHIP = { unused: 'default', in_progress: 'info', completed: 'success', deleted: 'default' } as const
const COLUMNS: CopyKey[] = ['exams.col.respondent', 'exams.col.test', 'exams.col.status', 'exams.col.result']

// 검사 탭: 구매자 아래에 함께 산 검사를 한 줄씩(응시자가 구매자·가족 누구든). 실시 완료이고 결과지가 연결된 줄만 결과를 연다.
export default function ExamsTab({ d }: { d: PurchaseDetail }) {
  const a = d.application
  const buyer = d.orderer?.name_masked ?? (a?.guardian_name as string | null) ?? (a?.client_name as string | null) ?? t('center.empty')
  const tests = liveTests(d.tests)
  const sum = examSummary(d.tests)

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('exams.buyer', { name: buyer })}</Typography>
        {d.naver?.external_order_id && <Typography variant="body2" color="text.secondary">{t('exams.order', { no: d.naver.external_order_id })}</Typography>}
        {sum.total > 0 && <Typography variant="body2" color="text.secondary">{t('exams.summary', { total: sum.total, done: sum.completed })}</Typography>}
      </Stack>
      {tests.length === 0
        ? <Typography variant="body2" color="text.secondary">{t('exams.empty')}</Typography>
        : (
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow>{COLUMNS.map((c) => <TableCell key={c}><Typography variant="caption" sx={{ fontWeight: 600 }}>{t(c)}</Typography></TableCell>)}</TableRow>
              </TableHead>
              <TableBody>
                {tests.map((x) => {
                  const open = x.exam_status === 'completed' && !!x.result_url
                  return (
                    <TableRow key={x.id}>
                      <TableCell>
                        {x.respondent_name
                          ? <Typography variant="body2" sx={{ fontWeight: 700 }}>{x.respondent_name}</Typography>
                          : <Typography variant="body2" color="text.secondary">{t('exams.nameLater')}</Typography>}
                      </TableCell>
                      <TableCell><Typography variant="body2">{x.test_name}</Typography></TableCell>
                      <TableCell>
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                          <Chip size="small" variant={x.exam_status === 'completed' ? 'filled' : 'outlined'} color={CHIP[x.exam_status]} label={examStatusLabel(x.exam_status)} />
                          {x.exam_status === 'completed' && x.exam_completed_at && <Typography variant="caption" color="text.secondary">{formatKstMonthDay(x.exam_completed_at)}</Typography>}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {open
                          ? (
                            <Button size="small" variant="outlined" startIcon={<DescriptionOutlinedIcon />} href={x.result_url!} target="_blank" rel="noopener noreferrer">
                              {t('exams.resultView')}
                            </Button>
                          )
                          : (
                            <Tooltip title={t('exams.resultLater')}>
                              <span>
                                <Button size="small" variant="outlined" startIcon={<DescriptionOutlinedIcon />} disabled>{t('exams.resultView')}</Button>
                              </span>
                            </Tooltip>
                          )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      <Typography variant="caption" color="text.secondary">{t('exams.note')}</Typography>
    </Stack>
  )
}
