import { Chip } from '@mui/material'
import { statusLabel, type CenterStatus } from '@counsel-core/centers.ts'

const LOOK: Record<CenterStatus, { color: 'primary' | 'default' | 'warning'; variant: 'filled' | 'outlined' }> = {
  active: { color: 'primary', variant: 'filled' },
  onboarding: { color: 'primary', variant: 'outlined' },
  paused: { color: 'warning', variant: 'outlined' },
  terminated: { color: 'default', variant: 'outlined' },
}

export default function StatusChip({ status }: { status: CenterStatus }) {
  const look = LOOK[status]
  return <Chip size="small" label={statusLabel(status)} color={look.color} variant={look.variant} />
}
