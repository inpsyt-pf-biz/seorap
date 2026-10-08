import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import Toast from '@seorap-web/components/Toast.tsx'
import { formatKstDateTime } from '@seorap-core/time.ts'
import { contractLabel, modesLabel, regionsLabel, typesLabel, type Center } from '@counsel-core/centers.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import { errorText, toCounselError, type CounselError } from '@counsel-core/errors.ts'
import { ErrorBox, Loading } from '../../../components/PageState'
import StatusChip from '../../../components/StatusChip'
import { getCenter } from '../../../lib/api'
import { hasCap, useSession } from '../../../shell/session'

function Row({ label, children }: { label: CopyKey; children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px 1fr' }, gap: { xs: 0.5, sm: 2 }, py: 1.5 }}>
      <Typography variant="body2" color="text.secondary">{t(label)}</Typography>
      <Box>{children}</Box>
    </Box>
  )
}

const text = (v: string | null) => <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>{v || t('center.empty')}</Typography>

export default function CenterDetailPage() {
  const { id = '' } = useParams()
  const { state } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const toastMessage = (location.state as { toast?: string } | null)?.toast
  const [toastOpen, setToastOpen] = useState(!!toastMessage)
  const [center, setCenter] = useState<Center | null>(null)
  const [error, setError] = useState<CounselError | null>(null)

  useEffect(() => {
    getCenter(id).then(setCenter, (e: unknown) => setError(toCounselError(e)))
  }, [id])

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>{center?.name ?? t('centers.title')}</Typography>
        <Button variant="outlined" onClick={() => navigate('/admin/counsel/centers')}>{t('detail.back')}</Button>
        {center && hasCap(state, 'center.manage') && (
          <Button variant="contained" onClick={() => navigate(`/admin/counsel/centers/${center.id}/edit`)}>{t('detail.edit')}</Button>
        )}
      </Stack>
      {error && <ErrorBox message={errorText(error)} />}
      {!center && !error && <Loading />}
      {center && (
        <Paper sx={{ px: 3, py: 1 }}>
          <Row label="center.field.status"><StatusChip status={center.status} /></Row>
          <Row label="center.field.regions">{text(regionsLabel(center.regions))}</Row>
          <Row label="center.field.types">{text(typesLabel(center.counseling_types))}</Row>
          <Row label="center.field.modes">{text(modesLabel(center.delivery_modes))}</Row>
          <Row label="center.field.phone">{text(center.phone)}</Row>
          <Row label="center.field.address">{text(center.address)}</Row>
          <Row label="center.field.contactName">{text(center.contact_name)}</Row>
          <Row label="center.field.contactPhone">{text(center.contact_phone)}</Row>
          <Row label="center.field.contract">{text(contractLabel(center.contract_from, center.contract_to))}</Row>
          <Row label="center.field.memo">{text(center.memo)}</Row>
          <Row label="center.field.createdAt">{text(formatKstDateTime(center.created_at))}</Row>
          <Row label="center.field.updatedAt">{text(formatKstDateTime(center.updated_at))}</Row>
        </Paper>
      )}
      {toastMessage && <Toast message={toastMessage} open={toastOpen} onClose={() => setToastOpen(false)} />}
    </Stack>
  )
}
