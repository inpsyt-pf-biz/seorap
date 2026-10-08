import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Alert, Box, CssBaseline, ThemeProvider } from '@mui/material'
import { t } from '@counsel-core/copy.ko.ts'
import { isLocalStackUrl } from './shell/localGuard'
import { adminTheme } from './theme/admin'

const root = createRoot(document.getElementById('root')!)

// 로컬 상담 툴 스택 주소가 아니면 DB 연결을 만들기 전에 멈추고 안내만 띄운다
if (!isLocalStackUrl(import.meta.env.VITE_SUPABASE_URL)) {
  root.render(
    <ThemeProvider theme={adminTheme}>
      <CssBaseline />
      <Box sx={{ p: 4 }}><Alert severity="error">{t('app.localOnly')}</Alert></Box>
    </ThemeProvider>,
  )
} else {
  const [{ default: App }, { default: SessionProvider }] = await Promise.all([import('./App'), import('./shell/SessionProvider')])
  root.render(
    <StrictMode>
      <ThemeProvider theme={adminTheme}>
        <CssBaseline />
        <BrowserRouter>
          <SessionProvider>
            <App />
          </SessionProvider>
        </BrowserRouter>
      </ThemeProvider>
    </StrictMode>,
  )
}
