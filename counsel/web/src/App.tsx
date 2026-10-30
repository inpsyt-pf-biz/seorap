import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { t } from '@counsel-core/copy.ko.ts'
import { ErrorBox, Loading } from './components/PageState'
import LoginPage from './pages/LoginPage'
import NoMembershipPage from './pages/NoMembershipPage'
import AdminShell from './pages/admin/counsel/AdminShell'
import CenterDetailPage from './pages/admin/counsel/CenterDetailPage'
import CenterFormPage from './pages/admin/counsel/CenterFormPage'
import CentersListPage from './pages/admin/counsel/CentersListPage'
import FormEditPage from './pages/admin/counsel/FormEditPage'
import HelpAdminPage from './pages/admin/counsel/HelpAdminPage'
import FormLinksPage from './pages/admin/counsel/FormLinksPage'
import FormsListPage from './pages/admin/counsel/FormsListPage'
import InboxPage from './pages/admin/counsel/InboxPage'
import PurchaseDetailPage from './pages/admin/counsel/PurchaseDetailPage'
import PurchaseFormPage from './pages/admin/counsel/PurchaseFormPage'
import PurchasesListPage from './pages/admin/counsel/PurchasesListPage'
import { hasCap, isHq, useSession } from './shell/session'

// 화면 가드는 길 안내일 뿐이다. 데이터는 DB 행 단위 권한과 쓰기 함수가 지킨다.
function RequireHq({ children }: { children: ReactNode }) {
  const { state } = useSession()
  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') return <ErrorBox message={t('error.generic')} />
  if (state.status === 'signedOut') return <Navigate to="/login" replace />
  if (!isHq(state)) return <Navigate to="/no-membership" replace />
  return children
}

function RequireCap({ cap, children }: { cap: string; children: ReactNode }) {
  const { state } = useSession()
  return hasCap(state, cap) ? children : <Navigate to="/admin/counsel/centers" replace />
}

function Home() {
  const { state } = useSession()
  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') return <ErrorBox message={t('error.generic')} />
  if (state.status === 'signedOut') return <Navigate to="/login" replace />
  return <Navigate to={isHq(state) ? '/admin/counsel/centers' : '/no-membership'} replace />
}

function SignedInOnly({ children }: { children: ReactNode }) {
  const { state } = useSession()
  if (state.status === 'loading') return <Loading />
  return state.status === 'signedOut' ? <Navigate to="/login" replace /> : children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/no-membership" element={<SignedInOnly><NoMembershipPage /></SignedInOnly>} />
      <Route path="/admin/counsel" element={<RequireHq><AdminShell /></RequireHq>}>
        <Route index element={<Navigate to="centers" replace />} />
        <Route path="centers" element={<CentersListPage />} />
        <Route path="centers/new" element={<RequireCap cap="center.manage"><CenterFormPage mode="create" /></RequireCap>} />
        <Route path="centers/:id" element={<CenterDetailPage />} />
        <Route path="centers/:id/edit" element={<RequireCap cap="center.manage"><CenterFormPage mode="edit" /></RequireCap>} />
        <Route path="purchases" element={<PurchasesListPage />} />
        <Route path="purchases/new" element={<RequireCap cap="purchase.manage"><PurchaseFormPage /></RequireCap>} />
        <Route path="purchases/inbox" element={<InboxPage />} />
        <Route path="purchases/:id" element={<PurchaseDetailPage />} />
        {/* 신청서 템플릿(서랍 B2): 담당자도 보기는 되고, 편집·게시·연결은 화면과 DB가 관리자만 허용한다 */}
        <Route path="forms" element={<FormsListPage />} />
        <Route path="forms/links" element={<FormLinksPage />} />
        <Route path="forms/:id" element={<FormEditPage />} />
        <Route path="help" element={<HelpAdminPage />} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
