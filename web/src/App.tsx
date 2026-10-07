import { Route, Routes } from 'react-router-dom'
import Placeholder from './pages/Placeholder'

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Placeholder />} />
    </Routes>
  )
}
