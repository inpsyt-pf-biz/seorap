import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'

// 바깥을 누르거나 뒤로 가기를 하면 onDismiss(기본은 onCancel). 두 버튼이 모두 "실행"인 창은 onDismiss 를 따로 준다.
// cancelLabel 을 주지 않으면 버튼은 하나(confirmLabel)만 보인다 (예: 코드 보기 창의 [닫기])
export default function ConfirmDialog(p: {
  open: boolean; title?: string; message: string; confirmLabel: string; cancelLabel?: string
  onConfirm: () => void; onCancel: () => void; onDismiss?: () => void
}) {
  return (
    <Dialog open={p.open} onClose={p.onDismiss ?? p.onCancel} fullWidth maxWidth="xs">
      {p.title && <DialogTitle>{p.title}</DialogTitle>}
      <DialogContent><Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>{p.message}</Typography></DialogContent>
      <DialogActions>
        {p.cancelLabel && <Button onClick={p.onCancel}>{p.cancelLabel}</Button>}
        <Button variant="contained" onClick={p.onConfirm}>{p.confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  )
}
