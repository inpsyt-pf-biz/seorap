import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import EntryPage from './pages/EntryPage'
import Placeholder from './pages/Placeholder'
import StatePage from './pages/StatePage'

const BoxPage = lazy(() => import('./pages/BoxPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const DevOutboxPage = lazy(() => import('./pages/DevOutboxPage'))
const isProd = import.meta.env.VITE_SEORAP_ENV === 'production'

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Placeholder />} />
        <Route path="/box" element={<BoxPage />} />
        <Route path="/box/history" element={<HistoryPage />} />
        {!isProd && <Route path="/dev/outbox" element={<DevOutboxPage />} />}
        <Route path="/:token" element={<EntryPage />} />
        <Route path="*" element={<StatePage kind="notFound" />} />
      </Routes>
    </Suspense>
  )
}
