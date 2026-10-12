import { Chip } from '@mui/material'
import { sessionStatusLabel, type SessionStatus } from '@counsel-core/purchases.ts'

const LOOK: Record<SessionStatus, { color: 'default' | 'primary' | 'warning' | 'success' | 'error'; variant: 'filled' | 'outlined' }> = {
  unassigned: { color: 'default', variant: 'outlined' },
  requested: { color: 'warning', variant: 'outlined' },
  confirmed: { color: 'primary', variant: 'outlined' },
  completed: { color: 'success', variant: 'filled' },
  unable: { color: 'error', variant: 'outlined' },
  cancelled: { color: 'default', variant: 'filled' },
}

export default function SessionStatusChip({ status }: { status: SessionStatus }) {
  const look = LOOK[status]
  return <Chip size="small" label={sessionStatusLabel(status)} color={look.color} variant={look.variant} />
}
