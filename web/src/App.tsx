import { Box } from '@mui/material'
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { usePageSurface } from './lib/pageSurface'
import EntryPage from './pages/EntryPage'
import Placeholder from './pages/Placeholder'
import StatePage from './pages/StatePage'
import { tokens } from './theme/seorap'

const BoxPage = lazy(() => import('./pages/BoxPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const PinSetPage = lazy(() => import('./pages/PinSetPage'))
const ReceiverPage = lazy(() => import('./pages/ReceiverPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const PinChangePage = lazy(() => import('./pages/PinChangePage'))
const CounselPage = lazy(() => import('./pages/CounselPage'))
// 가짜 발신함은 개발 서버·로컬·미리보기에서만 만든다(허용 목록). 환경값이 없거나 production 이면 아래 import 자체가 빌드에서
// 사라져 화면 코드가 운영 번들에 들어가지 않는다. API 쪽도 같은 허용 목록(SEORAP_ENV local/preview)을 쓴다.
// 허용 목록을 배열의 includes 로 쓰면 번들러가 미리 계산하지 못해 chunk 가 남으므로, 빌드 때 값이 박히는 === 비교로 쓴다.
const isDev = import.meta.env.DEV || import.meta.env.VITE_SEORAP_ENV === 'local' || import.meta.env.VITE_SEORAP_ENV === 'preview'
const DevOutboxPage = isDev ? lazy(() => import('./pages/DevOutboxPage')) : null

export default function App() {
  const surface = usePageSurface()
  // 서랍 컬럼(판). 휴대폰에서는 화면을 꽉 채우고, 넓은 화면에서는 책상색 바깥 위에 경계·그림자를 가진 한 장으로 선다
  return (
    <Box
      data-frame={surface}
      sx={{
        // 판 높이. 판 안의 화면(입장·막힌 화면 등)은 100dvh 대신 이 값을 따른다
        '--frame-min-h': '100dvh',
        maxWidth: tokens.layout.maxWidth, mx: 'auto', minHeight: 'var(--frame-min-h)',
        bgcolor: surface === 'closed' ? tokens.teal[700] : tokens.surface.page,
        '@media (min-width: 520px)': {
          boxShadow: `0 0 0 1px ${tokens.desk.edge}, 0 12px 40px ${tokens.desk.shadow}`,
          // 위아래가 잘린 띠가 아니라 한 장의 판으로 보이게 위아래 여백과 둥근 모서리 (10-30 비평 ①)
          '--frame-min-h': 'calc(100dvh - 48px)',
          my: 3, borderRadius: tokens.radius.sheet, overflow: 'hidden',
        },
      }}
    >
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Placeholder />} />
        <Route path="/box" element={<BoxPage />} />
        <Route path="/box/history" element={<HistoryPage />} />
        <Route path="/box/counsel/:orderId" element={<CounselPage />} />
        <Route path="/box/settings" element={<SettingsPage />} />
        <Route path="/box/settings/pin" element={<PinChangePage />} />
        <Route path="/pin" element={<PinSetPage />} />
        <Route path="/f/:token" element={<ReceiverPage />} />
        <Route path="/help" element={<HelpPage />} />
        {DevOutboxPage && <Route path="/dev/outbox" element={<DevOutboxPage />} />}
        <Route path="/:token" element={<EntryPage />} />
        <Route path="*" element={<StatePage kind="notFound" />} />
      </Routes>
    </Suspense>
    </Box>
  )
}
