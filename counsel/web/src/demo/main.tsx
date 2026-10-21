// 체험판 입구(demo.html). 실제 화면(App)을 그대로 쓰고, DB 대신 파일 속 가짜 데이터로 돈다(src/demo/fakeSupabase.ts).
// 파일을 더블클릭해 열어도 화면 이동이 되도록 주소의 # 뒤를 쓴다(HashRouter).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { copy } from '@counsel-core/copy.ko.ts'
import App from '../App'
import SessionProvider from '../shell/SessionProvider'
import { adminTheme } from '../theme/admin'
import ReviewPanel from './ReviewPanel'

// 체험판에는 지도 키를 넣지 않는다. 지도 자리 안내만 체험판 문구로 바꾼다
;(copy as Record<string, string>)['map.noKey'] = copy['demo.mapOff']

// 첫 화면은 구매 건 목록. 기록을 하나 더 쌓지 않게 바꿔 끼운다([뒤로]가 엉뚱한 화면으로 가지 않게)
if (!window.location.hash || window.location.hash === '#/') window.history.replaceState(null, '', '#/admin/counsel/purchases')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={adminTheme}>
      <CssBaseline />
      <HashRouter>
        <SessionProvider>
          <App />
          <ReviewPanel />
        </SessionProvider>
      </HashRouter>
    </ThemeProvider>
  </StrictMode>,
)
