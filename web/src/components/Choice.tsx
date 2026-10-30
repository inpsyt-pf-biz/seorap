import { ButtonBase, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { tokens } from '../theme/seorap'

// 신청서의 고르기(시간대 칸·상담 방식·연락 시간)를 한 모양으로: 입력 칸과 같은 옅은 종이색 바탕·같은 선,
// 고르면 옅은 청록 바탕·청록 선·체크. 비활성처럼 보이던 빈 칸·낯선 버튼 규칙을 없앤다 (10-30 검수)
export default function Choice({ selected, onClick, disabled, label, children }: {
  selected: boolean; onClick: () => void; disabled?: boolean; label?: string; children?: ReactNode
}) {
  return (
    <ButtonBase
      data-choice aria-pressed={selected} aria-label={label} disabled={disabled} onClick={onClick}
      sx={{
        minHeight: 48, width: '100%', px: 1.5, borderRadius: tokens.radius.control,
        bgcolor: selected ? tokens.teal[100] : tokens.surface[50],
        border: `1px solid ${selected ? tokens.teal[700] : tokens.surface[300]}`,
        color: selected ? tokens.teal[700] : tokens.text.primary,
        '&:hover': { borderColor: tokens.teal[500] },
        '&.Mui-disabled': { color: tokens.text.disabled, borderColor: tokens.surface[200] },
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
        {selected && (
          <svg data-part="check" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {children && <Typography variant="body1" sx={{ fontWeight: 500 }}>{children}</Typography>}
      </Stack>
    </ButtonBase>
  )
}
