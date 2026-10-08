import { NavLink, Outlet } from 'react-router-dom'
import { AppBar, Box, Button, List, ListItemButton, ListItemText, Toolbar, Typography } from '@mui/material'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import DemoBanner from '../../../components/DemoBanner'
import { useSession } from '../../../shell/session'
import { adminLayout, tokens } from '../../../theme/admin'

const NAV = [{ to: '/admin/counsel/centers', label: 'nav.centers' as CopyKey }]

// 인싸이트 쪽 바깥 틀. 나중에 서랍 어드민으로 옮길 때는 이 틀 대신 서랍 어드민 틀 안에 페이지들을 넣는다.
export default function AdminShell() {
  const { state, signOut } = useSession()
  const ctx = state.status === 'ready' ? state.ctx : null
  const who = ctx ? [ctx.display_name, ctx.membership && t(`role.${ctx.membership.role}` as CopyKey)].filter(Boolean).join(' · ') : ''

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <DemoBanner />
      <AppBar position="static">
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('app.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{who}</Typography>
          <Button size="small" onClick={() => void signOut()}>{t('auth.logout')}</Button>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
        <Box component="nav" sx={{
          width: adminLayout.navWidth, flexShrink: 0, display: { xs: 'none', md: 'block' },
          bgcolor: tokens.surface[0], borderRight: `1px solid ${tokens.surface[200]}`,
        }}>
          <List>
            {NAV.map((n) => (
              <ListItemButton key={n.to} component={NavLink} to={n.to}
                sx={{ mx: 1, borderRadius: 2, '&.active': { bgcolor: tokens.brand[100], color: tokens.brand[900] } }}>
                <ListItemText primary={t(n.label)} />
              </ListItemButton>
            ))}
          </List>
        </Box>
        <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 3 } }}>
          <Box sx={{ maxWidth: adminLayout.contentMaxWidth, mx: 'auto' }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
