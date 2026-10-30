import { Tooltip } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import { examStatusLabel } from '@counsel-core/exams.ts'
import { tokens } from '../theme/admin'

// 검사 한 줄의 응시 상태를 아이콘 하나로: 미응시 회색 체크, 응시 중 청록 테두리 체크, 응시 완료 청록 채움 체크.
// 색만으로 구분하지 않도록 모양(테두리·채움)도 다르고, 글자는 툴팁과 읽어 주기 이름으로 둔다.
const LOOK: Record<string, { filled: boolean; color: string }> = {
  unused: { filled: false, color: tokens.text.disabled },
  in_progress: { filled: false, color: tokens.teal[500] },
  completed: { filled: true, color: tokens.teal[700] },
}

export default function ExamStatusIcon({ status }: { status: string }) {
  const look = LOOK[status] ?? LOOK.unused
  const Icon = look.filled ? CheckCircleIcon : CheckCircleOutlineIcon
  const label = examStatusLabel(status)
  return (
    <Tooltip title={label}>
      <Icon role="img" aria-label={label} sx={{ fontSize: 18, flexShrink: 0, color: look.color }} />
    </Tooltip>
  )
}
