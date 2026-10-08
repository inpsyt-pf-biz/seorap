import { Alert, Box, CircularProgress } from '@mui/material'

export function Loading() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
      <CircularProgress size={28} />
    </Box>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return <Alert severity="error" sx={{ my: 2 }}>{message}</Alert>
}
