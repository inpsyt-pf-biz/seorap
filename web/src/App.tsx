import { Route, Routes } from 'react-router-dom'
import Placeholder from './pages/Placeholder'
import VerifyDemo from './pages/VerifyDemo'

// 기본 주소 시연용 (10-21): 첫 화면과 구매자 인증 화면만. 서버를 부르지 않는다
export default function App() {
  return (
    <Routes>
      <Route path="/verify" element={<VerifyDemo />} />
      <Route path="*" element={<Placeholder />} />
    </Routes>
  )
}
