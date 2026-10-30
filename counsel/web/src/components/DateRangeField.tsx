import { useRef, useState, type KeyboardEvent } from 'react'
import { Box, ButtonBase, IconButton, Popover, Stack, Typography } from '@mui/material'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CloseIcon from '@mui/icons-material/Close'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { addDays, addMonths, dayRole, monthGrid, pickDay, type DateRange, type Picking } from '@counsel-core/dateRange.ts'
import { PERIODS, periodRange } from '@counsel-core/purchases.ts'
import { tokens } from '../theme/admin'

// 기간 거르기 칸. 누르면 달력 두 달이 열리고, 첫 클릭은 시작일·둘째 클릭은 종료일로 한 번에 범위를 정한다.
// 왼쪽에는 자주 쓰는 기간(오늘·최근 7일·최근 30일)을 둔다. 방향키로 날을 옮기고 Enter 로 고른다.
type Props = { value: DateRange | null; today: string; onChange: (range: DateRange | null) => void }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function DateRangeField({ value, today, onChange }: Props) {
  const anchor = useRef<HTMLButtonElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState<Picking>({ start: null })
  const [hover, setHover] = useState<string | null>(null)
  // 왼쪽 달. 오른쪽 달은 그다음 달. 열 때 종료일(없으면 오늘)이 오른쪽 달에 오게 한다
  const [view, setView] = useState(() => addMonths(Number(today.slice(0, 4)), Number(today.slice(5, 7)), -1))

  const openPopover = () => {
    const end = value?.to || today
    setView(addMonths(Number(end.slice(0, 4)), Number(end.slice(5, 7)), -1))
    setPicking({ start: null }); setHover(null); setOpen(true)
  }
  const finish = (range: DateRange | null) => { onChange(range); setOpen(false) }
  const pick = (day: string) => {
    const r = pickDay(picking, day)
    setPicking(r.picking)
    if (r.done) finish(r.done)
  }

  // 방향키: 하루·한 주 이동, 보이는 두 달을 벗어나면 달을 넘긴다
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const day = (e.target as HTMLElement).dataset.day
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (!day || step === undefined) return
    e.preventDefault()
    const next = addDays(day, step)
    const first = `${view.y}-${String(view.m).padStart(2, '0')}`
    const last = (() => { const r = addMonths(view.y, view.m, 1); return `${r.y}-${String(r.m).padStart(2, '0')}` })()
    if (next.slice(0, 7) < first) setView(addMonths(view.y, view.m, -1))
    if (next.slice(0, 7) > last) setView(addMonths(view.y, view.m, 1))
    setHover(next)
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus())
  }

  const label = value ? (value.from === value.to ? value.from : `${value.from} ~ ${value.to}`) : t('purchases.period.all')
  const months = [view, addMonths(view.y, view.m, 1)]

  return (
    <>
      <Box sx={{ position: 'relative', display: 'inline-flex', minWidth: 230 }}>
        <ButtonBase ref={anchor} onClick={openPopover} aria-haspopup="dialog" aria-expanded={open} aria-label={`${t('purchases.period')}: ${label}`}
          sx={{
            width: '100%', justifyContent: 'flex-start', gap: 1, height: 40, pl: 1.5, pr: value ? 5 : 1.5, borderRadius: 2,
            border: `1px solid ${open ? tokens.teal[500] : tokens.surface[300]}`, bgcolor: tokens.surface[0], typography: 'body2',
            color: value ? 'text.primary' : 'text.secondary', whiteSpace: 'nowrap',
          }}>
          <CalendarMonthOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          {label}
        </ButtonBase>
        {value && (
          <IconButton size="small" aria-label={t('purchases.period.clear')} onClick={() => onChange(null)}
            sx={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      <Popover open={open} anchorEl={anchor.current} onClose={() => setOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { role: 'dialog', 'aria-label': t('purchases.period'), sx: { mt: 0.75, borderRadius: 3 } } }}>
        <Stack direction="row">
          <Stack sx={{ p: 1, gap: 0.25, borderRight: `1px solid ${tokens.surface[200]}`, minWidth: 112 }}>
            {PERIODS.map((p) => (
              <ButtonBase key={p} onClick={() => finish(periodRange(p, today))}
                sx={{ justifyContent: 'flex-start', px: 1.5, py: 1, borderRadius: 2, typography: 'body2', '&:hover': { bgcolor: tokens.surface[100] } }}>
                {t(`purchases.period.${p}` as CopyKey)}
              </ButtonBase>
            ))}
            <ButtonBase onClick={() => finish(null)}
              sx={{ justifyContent: 'flex-start', px: 1.5, py: 1, borderRadius: 2, typography: 'body2', color: 'text.secondary', '&:hover': { bgcolor: tokens.surface[100] } }}>
              {t('purchases.period.all')}
            </ButtonBase>
          </Stack>
          <Box sx={{ p: 2 }}>
            <Stack direction="row" sx={{ gap: 3 }} ref={grid} onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
              {months.map((mo, i) => (
                <Box key={`${mo.y}-${mo.m}`}>
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1, height: 32 }}>
                    {i === 0
                      ? <IconButton size="small" aria-label={t('purchases.period.prevMonth')} onClick={() => setView(addMonths(view.y, view.m, -1))}><ChevronLeftIcon /></IconButton>
                      : <Box sx={{ width: 34 }} />}
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('purchases.period.month', { y: mo.y, m: mo.m })}</Typography>
                    {i === 1
                      ? <IconButton size="small" aria-label={t('purchases.period.nextMonth')} onClick={() => setView(addMonths(view.y, view.m, 1))}><ChevronRightIcon /></IconButton>
                      : <Box sx={{ width: 34 }} />}
                  </Stack>
                  <Box role="grid" sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 36px)', rowGap: 0.25 }}>
                    {WEEKDAYS.map((w) => (
                      <Typography key={w} variant="caption" color="text.secondary" sx={{ textAlign: 'center', lineHeight: '28px' }}>{w}</Typography>
                    ))}
                    {monthGrid(mo.y, mo.m).flat().map((day, k) => {
                      if (!day) return <Box key={`e${k}`} />
                      const role = dayRole(day, value, picking, hover)
                      return (
                        <ButtonBase key={day} data-day={day} aria-label={day} aria-pressed={role === 'edge'}
                          onClick={() => pick(day)} onMouseEnter={() => setHover(day)}
                          sx={{
                            height: 36, typography: 'body2', borderRadius: role === 'between' ? 0 : 2,
                            bgcolor: role === 'edge' ? tokens.teal[500] : role === 'between' ? tokens.teal[100] : 'transparent',
                            color: role === 'edge' ? tokens.surface[0] : 'text.primary', fontWeight: day === today ? 700 : 400,
                            outline: day === today && role !== 'edge' ? `1px solid ${tokens.teal[500]}` : 'none', outlineOffset: -1,
                            '&:hover': role ? {} : { bgcolor: tokens.surface[100] },
                            '&.Mui-focusVisible': { boxShadow: `0 0 0 2px ${tokens.teal[500]}` },
                          }}>
                          {Number(day.slice(8))}
                        </ButtonBase>
                      )
                    })}
                  </Box>
                </Box>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
              {t(picking.start ? 'purchases.period.pickEnd' : 'purchases.period.pickStart')}
            </Typography>
          </Box>
        </Stack>
      </Popover>
    </>
  )
}
