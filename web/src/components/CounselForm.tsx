import { Box, Checkbox, Chip, Divider, FormControlLabel, FormHelperText, Radio, RadioGroup, Stack, TextField, ToggleButton, Typography } from '@mui/material'
import {
  type AnswerProblem, type Answers, type AvailabilityAnswer, type FormDefinition, type FormField, DEFAULT_AVAILABILITY, LIMITS,
} from '@core/counselForm.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import { tokens } from '../theme/seorap'

// 상담 신청서 화면 부품 (B2). 서랍 신청서 화면과 상담 어드민 미리보기가 같이 쓴다.
// 값은 부모가 들고 있고(onChange 로 바뀐 답 전체를 돌려준다), 검사는 counselForm.checkAnswers 로 부모가 한다.

type Props = {
  definition: FormDefinition
  value: Answers
  onChange: (next: Answers) => void
  errors?: Record<string, AnswerProblem>
  disabled?: boolean
}

function Title({ f }: { f: FormField }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{f.label}</Typography>
      <Typography variant="caption" color={f.required ? 'primary' : 'text.secondary'}>{t(f.required ? 'form.required' : 'form.optional')}</Typography>
    </Stack>
  )
}

function Help({ text }: { text?: string }) {
  return text ? <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{text}</Typography> : null
}

function Availability({ f, value, onChange, disabled }: { f: FormField; value: AvailabilityAnswer | undefined; onChange: (v: AvailabilityAnswer) => void; disabled?: boolean }) {
  const cfg = f.availability ?? DEFAULT_AVAILABILITY
  const a: AvailabilityAnswer = value ?? { cells: [] }
  const toggle = (cell: string) => onChange({ ...a, cells: a.cells.includes(cell) ? a.cells.filter((c) => c !== cell) : [...a.cells, cell] })
  const pick = (key: 'method' | 'contactTime', v: string) => onChange({ ...a, [key]: a[key] === v ? undefined : v })
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">{t('form.avail.pick')}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: `56px repeat(${cfg.slots.length}, 1fr)`, gap: 1, alignItems: 'center' }}>
        <span />
        {cfg.slots.map((s) => (
          <Typography key={s.id} variant="caption" color="text.secondary" sx={{ textAlign: 'center', lineHeight: 1.3 }}>
            {s.label}<br />{s.hours}
          </Typography>
        ))}
        {cfg.days.map((d) => [
          <Typography key={`${d.id}-label`} variant="body2">{d.label}</Typography>,
          ...cfg.slots.map((s) => {
            const cell = `${d.id}|${s.id}`
            const on = a.cells.includes(cell)
            return (
              <ToggleButton
                key={cell} value={cell} selected={on} disabled={disabled} onChange={() => toggle(cell)}
                aria-label={`${d.label} ${s.label} 상담 가능`} sx={{ minHeight: 44, borderRadius: 2 }}
              >
                {on ? '✓' : ''}
              </ToggleButton>
            )
          }),
        ])}
      </Box>
      {cfg.askStartDate && (
        <TextField
          type="date" label={t('form.avail.start')} value={a.startDate ?? ''} disabled={disabled}
          onChange={(e) => onChange({ ...a, startDate: e.target.value || undefined })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      )}
      {([['method', 'form.avail.method', cfg.methods], ['contactTime', 'form.avail.contact', cfg.contactTimes]] as const).map(([key, label, opts]) =>
        opts.length > 0 && (
          <Stack key={key} spacing={1}>
            <Typography variant="body2">{t(label)}</Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {opts.map((o) => (
                <Chip
                  key={o} label={o} clickable disabled={disabled} color={a[key] === o ? 'primary' : 'default'}
                  variant={a[key] === o ? 'filled' : 'outlined'} aria-pressed={a[key] === o} onClick={() => pick(key, o)}
                />
              ))}
            </Stack>
          </Stack>
        ))}
    </Stack>
  )
}

export default function CounselForm({ definition, value, onChange, errors = {}, disabled }: Props) {
  const set = (id: string, v: unknown) => onChange({ ...value, [id]: v })

  return (
    <Stack spacing={3}>
      {definition.intro && <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>{definition.intro}</Typography>}
      {definition.fields.map((f) => {
        const err = errors[f.id]
        const errText = err ? <FormHelperText error>{t(`form.error.${err}` as CopyKey)}</FormHelperText> : null
        const v = value[f.id]
        if (f.type === 'section') {
          return (
            <Stack key={f.id} spacing={1}>
              <Divider />
              <Typography variant="h6">{f.label}</Typography>
              <Help text={f.help} />
            </Stack>
          )
        }
        if (f.type === 'notice') {
          return (
            <Box key={f.id} sx={{ p: 2, borderRadius: 2, bgcolor: tokens.surface[50], border: `1px solid ${tokens.surface[200]}` }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>{f.label}</Typography>
              <Help text={f.help} />
            </Box>
          )
        }
        return (
          <Stack key={f.id} spacing={1} data-field={f.id}>
            <Title f={f} />
            {f.type === 'consent' ? (
              <>
                {f.help && (
                  <Box sx={{ p: 2, maxHeight: 200, overflowY: 'auto', borderRadius: 2, bgcolor: tokens.surface[50], border: `1px solid ${tokens.surface[200]}` }}>
                    <Help text={f.help} />
                  </Box>
                )}
                <FormControlLabel
                  control={<Checkbox checked={v === true} disabled={disabled} onChange={(e) => set(f.id, e.target.checked)} />}
                  label={f.options?.[0] || t('form.agree')}
                />
              </>
            ) : (
              <>
                <Help text={f.help} />
                {(f.type === 'short' || f.type === 'long') && (
                  <TextField
                    value={typeof v === 'string' ? v : ''} disabled={disabled} multiline={f.type === 'long'} minRows={f.type === 'long' ? 3 : undefined}
                    onChange={(e) => set(f.id, e.target.value)} error={!!err}
                    slotProps={{ htmlInput: { maxLength: LIMITS[f.type], 'aria-label': f.label } }}
                  />
                )}
                {f.type === 'date' && (
                  <TextField
                    type="date" value={typeof v === 'string' ? v : ''} disabled={disabled} error={!!err}
                    onChange={(e) => set(f.id, e.target.value)} slotProps={{ htmlInput: { 'aria-label': f.label } }}
                  />
                )}
                {f.type === 'single' && (
                  <RadioGroup value={typeof v === 'string' ? v : ''} onChange={(e) => set(f.id, e.target.value)} aria-label={f.label}>
                    {(f.options ?? []).map((o) => <FormControlLabel key={o} value={o} control={<Radio disabled={disabled} />} label={o} />)}
                  </RadioGroup>
                )}
                {f.type === 'multi' && (
                  <Stack>
                    {(f.options ?? []).map((o) => {
                      const list = Array.isArray(v) ? (v as string[]) : []
                      return (
                        <FormControlLabel
                          key={o} label={o}
                          control={<Checkbox checked={list.includes(o)} disabled={disabled}
                            onChange={(e) => set(f.id, e.target.checked ? [...list, o] : list.filter((x) => x !== o))} />}
                        />
                      )
                    })}
                  </Stack>
                )}
                {f.type === 'availability' && (
                  <Availability f={f} value={v as AvailabilityAnswer | undefined} disabled={disabled} onChange={(a) => set(f.id, a)} />
                )}
              </>
            )}
            {errText}
          </Stack>
        )
      })}
    </Stack>
  )
}
