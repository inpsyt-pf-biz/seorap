import { Button, Chip, FormControlLabel, Menu, MenuItem, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material'
import { useState } from 'react'
import type { FormField } from '@seorap-core/counselForm.ts'
import { t } from '@counsel-core/copy.ko.ts'

// 문항 편집 카드의 11-10 조각: 기타(직접 입력) 받기 · 보이는 조건 · 앞 질문의 답 넣기.
// earlier: 이 문항보다 앞에 있는, 답을 받는 문항들 (조건과 끼워 넣기는 앞 문항만 가리킨다)
export default function FieldLogic({ f, earlier, readOnly, onChange }: {
  f: FormField; earlier: FormField[]; readOnly: boolean; onChange: (patch: Partial<FormField>) => void
}) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const choice = f.type === 'single' || f.type === 'multi'
  const src = f.showIf ? earlier.find((x) => x.id === f.showIf!.field) : undefined
  const anyOf = f.showIf?.anyOf ?? []
  // 끼워 넣을 수 있는 앞 문항: 고르는 문항과 글로 답하는 문항
  const pipeable = earlier.filter((x) => ['single', 'multi', 'short'].includes(x.type))

  return (
    <Stack spacing={1.25}>
      {choice && (
        <Tooltip title={t('forms.edit.otherHelp')}>
          <FormControlLabel label={t('forms.edit.other')} disabled={readOnly}
            control={<Switch checked={!!f.other} onChange={(e) => onChange({ other: e.target.checked || undefined })} />} />
        </Tooltip>
      )}
      {earlier.length > 0 && (
        <TextField size="small" select label={t('forms.edit.showIf')} value={f.showIf?.field ?? ''} disabled={readOnly} sx={{ maxWidth: 420 }}
          onChange={(e) => onChange({ showIf: e.target.value ? { field: e.target.value } : undefined })}>
          <MenuItem value="">{t('forms.edit.showIf.always')}</MenuItem>
          {earlier.map((x) => <MenuItem key={x.id} value={x.id}>{t('forms.edit.showIf.answered', { label: x.label })}</MenuItem>)}
        </TextField>
      )}
      {src && (src.type === 'single' || src.type === 'multi') && (
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary">{t('forms.edit.showIf.anyOf')}</Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            {(src.options ?? []).map((o) => {
              const on = anyOf.includes(o)
              return (
                <Chip
                  key={o} label={o} disabled={readOnly} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'}
                  aria-pressed={on}
                  onClick={() => {
                    const next = on ? anyOf.filter((x) => x !== o) : [...anyOf, o]
                    onChange({ showIf: { field: src.id, ...(next.length ? { anyOf: next } : {}) } })
                  }}
                />
              )
            })}
          </Stack>
        </Stack>
      )}
      {pipeable.length > 0 && !readOnly && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button size="small" variant="text" onClick={(e) => setMenu(e.currentTarget)} aria-haspopup="menu">{t('forms.edit.insert')}</Button>
          <Typography variant="caption" color="text.secondary">{t('forms.edit.insertHelp')}</Typography>
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
            {pipeable.map((x) => (
              <MenuItem key={x.id} onClick={() => { onChange({ label: `${f.label}{{${x.id}}}` }); setMenu(null) }}>{x.label}</MenuItem>
            ))}
          </Menu>
        </Stack>
      )}
    </Stack>
  )
}
