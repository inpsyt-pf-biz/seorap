import { useRef, useState } from 'react'
import { Box, Chip, InputBase } from '@mui/material'
import { t } from '@counsel-core/copy.ko.ts'

// 배지 목록 편집 (신청서 템플릿의 선택지·요일·시간대 등). 배지를 누르면 그 자리에서 고치고, x 로 빼고,
// 끝의 옅은 [추가하기]를 누르면 입력 칸이 열린다. Enter 로 추가하면 칸이 열린 채로 다음 입력을 받는다.
type Props = {
  items: string[]
  onAdd: (value: string) => void
  onEdit: (index: number, value: string) => void
  onRemove: (index: number) => void
  // 이 개수 아래로는 뺄 수 없다 (요일·시간대는 1)
  min?: number
  readOnly?: boolean
  placeholder?: string
}

// 'new' 는 새 항목 입력, 숫자는 그 자리 배지를 고치는 중
type Editing = number | 'new' | null

function ChipInput({ value, placeholder, invalid, onChange, onEnter, onBlur, onEscape }: {
  value: string; placeholder?: string; invalid?: boolean
  onChange: (v: string) => void; onEnter: () => void; onBlur: () => void; onEscape: () => void
}) {
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', height: 32, px: 1.5, borderRadius: 4,
      border: 1, borderColor: invalid ? 'error.main' : 'primary.main', bgcolor: 'background.paper',
    }}>
      <InputBase
        autoFocus value={value} placeholder={placeholder} inputProps={{ 'aria-invalid': invalid }} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        // 한글 조합 중 Enter 는 글자 확정이므로 넘긴다
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') { e.preventDefault(); onEnter() }
          if (e.key === 'Escape') onEscape()
        }}
        sx={{ fontSize: 14, width: `${Math.max(8, value.length * 1.4 + 2)}ch` }}
      />
    </Box>
  )
}

export default function ChipListEditor({ items, onAdd, onEdit, onRemove, min = 0, readOnly, placeholder }: Props) {
  const [editing, setEditing] = useState<Editing>(null)
  const [text, setText] = useState('')
  // Enter·Esc 로 닫은 뒤 이어서 오는 blur 가 한 번 더 저장하지 않게
  const closed = useRef(false)

  const open = (e: Editing, initial: string) => { closed.current = false; setEditing(e); setText(initial) }
  const close = () => { closed.current = true; setEditing(null); setText('') }
  const taken = (v: string, except?: number) => items.some((x, i) => i !== except && x.trim() === v)

  // 새 항목: 비었거나 이미 있으면 넣지 않는다 (이미 있으면 입력 칸 테두리가 빨갛다)
  const addNow = () => {
    const v = text.trim()
    if (!v || taken(v)) return false
    onAdd(v); setText('')
    return true
  }
  const editNow = (i: number) => {
    const v = text.trim()
    if (v && v !== items[i] && !taken(v, i)) onEdit(i, v)
    close()
  }

  const canRemove = !readOnly && items.length > min
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      {items.map((item, i) => editing === i ? (
        <ChipInput key={i} value={text} invalid={taken(text.trim(), i)} onChange={setText} onEnter={() => editNow(i)} onEscape={close}
          onBlur={() => { if (!closed.current) editNow(i) }} />
      ) : (
        <Chip
          key={i} label={item}
          onClick={readOnly ? undefined : () => open(i, item)}
          onDelete={canRemove ? () => onRemove(i) : undefined}
        />
      ))}
      {!readOnly && (editing === 'new' ? (
        <ChipInput value={text} placeholder={placeholder} invalid={taken(text.trim())} onChange={setText} onEnter={addNow} onEscape={close}
          onBlur={() => { if (!closed.current) { addNow(); close() } }} />
      ) : (
        <Chip
          label={`+ ${t('forms.edit.chipAdd')}`} aria-label={t('forms.edit.chipAdd')} variant="outlined" onClick={() => open('new', '')}
          sx={{ borderStyle: 'dashed', color: 'text.secondary', borderColor: 'divider' }}
        />
      ))}
    </Box>
  )
}
