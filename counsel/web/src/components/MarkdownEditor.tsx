import { useRef } from 'react'
import { Button, ButtonGroup, Stack, TextField } from '@mui/material'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { insertLink, prefixLines, wrapSelection, type Edit } from '@counsel-core/markdownEdit.ts'
import { isAllowedUrl } from '@seorap-core/helpContent.ts'

// 도움말 답 에디터 (10-30): 마크다운 입력 + 서식 단추. 결과 모양은 옆의 서랍 미리보기로 본다
type Props = { label: string; value: string; onChange: (v: string) => void; maxLength: number; error?: string; minRows?: number }

export default function MarkdownEditor({ label, value, onChange, maxLength, error, minRows = 6 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const apply = (f: (text: string, s: number, e: number) => Edit | null) => {
    const el = ref.current
    if (!el) return
    const r = f(value, el.selectionStart, el.selectionEnd)
    if (!r) return
    onChange(r.text)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.selStart, r.selEnd) })
  }
  const link = () => apply((text, s, e) => {
    const url = window.prompt(t('help.linkPrompt'))?.trim()
    return url && isAllowedUrl(url) ? insertLink(text, s, e, url) : null
  })
  const tools: [CopyKey, () => void][] = [
    ['help.fmt.bold', () => apply((x, s, e) => wrapSelection(x, s, e, '**'))],
    ['help.fmt.italic', () => apply((x, s, e) => wrapSelection(x, s, e, '*'))],
    ['help.fmt.ul', () => apply((x, s, e) => prefixLines(x, s, e, 'ul'))],
    ['help.fmt.ol', () => apply((x, s, e) => prefixLines(x, s, e, 'ol'))],
    ['help.fmt.link', link],
  ]
  return (
    <Stack spacing={1}>
      <ButtonGroup size="small" variant="outlined">
        {tools.map(([k, fn]) => <Button key={k} onClick={fn}>{t(k)}</Button>)}
      </ButtonGroup>
      <TextField
        label={label} value={value} onChange={(e) => onChange(e.target.value)} multiline minRows={minRows} fullWidth
        inputRef={ref} error={!!error} helperText={error || `${[...value].length} / ${maxLength}`}
        slotProps={{ htmlInput: { maxLength } }}
      />
    </Stack>
  )
}
