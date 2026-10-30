import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AppBar, Box, Button, List, ListItemButton, ListItemText, Tab, Tabs, Toolbar, Typography } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import CommandPalette, { isMac } from '../../../components/CommandPalette'
import DemoBanner from '../../../components/DemoBanner'
import { CommandsProvider } from '../../../shell/commands'
import { useSession } from '../../../shell/session'
import { adminLayout, tokens } from '../../../theme/admin'

const NAV: { to: string; label: CopyKey }[] = [
  { to: '/admin/counsel/purchases', label: 'nav.purchases' },
  { to: '/admin/counsel/centers', label: 'nav.centers' },
  { to: '/admin/counsel/forms', label: 'nav.forms' },
]

// 인싸이트 쪽 바깥 틀. 나중에 서랍 어드민으로 옮길 때는 이 틀 대신 서랍 어드민 틀 안에 페이지들을 넣는다.
export default function AdminShell() {
  const { state, signOut } = useSession()
  const ctx = state.status === 'ready' ? state.ctx : null
  const who = ctx ? [ctx.display_name, ctx.membership && t(`role.${ctx.membership.role}` as CopyKey)].filter(Boolean).join(' · ') : ''
  const { pathname } = useLocation()
  const current = NAV.find((n) => pathname.startsWith(n.to))?.to ?? false
  const [palette, setPalette] = useState(false)
  // Ctrl+K(맥 ⌘K)는 어디서나 명령 팔레트를 열고 닫는다. / 는 입력 칸 밖에서만
  useEffect(() => {
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((o) => !o) }
      else if (e.key === '/' && !typing(e.target)) { e.preventDefault(); setPalette(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <CommandsProvider>
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <DemoBanner />
      <AppBar position="static">
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('app.title')}</Typography>
          <Button variant="outlined" size="small" startIcon={<SearchIcon />} onClick={() => setPalette(true)} aria-keyshortcuts="Control+K Meta+K"
            sx={{ color: 'text.secondary', borderColor: tokens.surface[300], gap: 0.5 }}>
            {t('palette.open')}
            <Box component="kbd" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 1, px: 0.75, borderRadius: tokens.radius.control, border: `1px solid ${tokens.surface[200]}`, font: 'inherit', fontSize: 12 }}>
              {isMac() ? '⌘K' : 'Ctrl K'}
            </Box>
          </Button>
          <Typography variant="body2" color="text.secondary">{who}</Typography>
          <Button size="small" onClick={() => void signOut()}>{t('auth.logout')}</Button>
        </Toolbar>
        {/* 좁은 화면(왼쪽 메뉴가 숨는 폭)에서는 같은 메뉴를 머리 아래 탭으로 */}
        <Tabs component="nav" value={current} variant="scrollable" scrollButtons={false}
          sx={{ display: { xs: 'flex', md: 'none' }, px: 1, borderTop: `1px solid ${tokens.surface[200]}` }}>
          {NAV.map((n) => <Tab key={n.to} value={n.to} label={t(n.label)} component={NavLink} to={n.to} />)}
        </Tabs>
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
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </Box>
    </CommandsProvider>
  )
}
