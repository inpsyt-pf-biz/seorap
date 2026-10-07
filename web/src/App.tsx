import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import EntryPage from './pages/EntryPage'
import Placeholder from './pages/Placeholder'
import StatePage from './pages/StatePage'

const BoxPage = lazy(() => import('./pages/BoxPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
// 가짜 발신함은 개발 서버·로컬·미리보기에서만 만든다(허용 목록). 환경값이 없거나 production 이면 아래 import 자체가 빌드에서
// 사라져 화면 코드가 운영 번들에 들어가지 않는다. API 쪽도 같은 허용 목록(SEORAP_ENV local/preview)을 쓴다.
// 허용 목록을 배열의 includes 로 쓰면 번들러가 미리 계산하지 못해 chunk 가 남으므로, 빌드 때 값이 박히는 === 비교로 쓴다.
const isDev = import.meta.env.DEV || import.meta.env.VITE_SEORAP_ENV === 'local' || import.meta.env.VITE_SEORAP_ENV === 'preview'
const DevOutboxPage = isDev ? lazy(() => import('./pages/DevOutboxPage')) : null

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Placeholder />} />
        <Route path="/box" element={<BoxPage />} />
        <Route path="/box/history" element={<HistoryPage />} />
        {DevOutboxPage && <Route path="/dev/outbox" element={<DevOutboxPage />} />}
        <Route path="/:token" element={<EntryPage />} />
        <Route path="*" element={<StatePage kind="notFound" />} />
      </Routes>
    </Suspense>
  )
}
