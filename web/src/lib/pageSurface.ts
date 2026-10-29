import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { tokens } from '../theme/seorap'

// 닫힌 서랍(입장·비밀번호 설정)인 경로인가. 입장 주소는 /{토큰} 한 칸이고, 같은 한 칸 주소 중 정해진 화면은 뺀다
const OPEN_SINGLE = new Set(['/', '/box', '/help', '/pin'])
export function isClosedPath(pathname: string): boolean {
  if (pathname === '/pin') return true
  return /^\/[^/]+$/.test(pathname) && !OPEN_SINGLE.has(pathname)
}

// 페이지 바탕(body)과 휴대폰 상단 막대(theme-color)를 경로에 맞춰 칠한다.
// 화면 안쪽 판만 칠하면 불러오는 동안·화면 전환 순간·당겨 내릴 때 다른 색이 비친다 (10-29 건우님 검수)
export function usePageSurface() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    const color = isClosedPath(pathname) ? tokens.teal[700] : tokens.surface.page
    // html 에도 칠한다: index.html 이 첫 화면 전에 html 을 칠해 두므로, 둘이 어긋나면 당겨 내릴 때 옛 색이 보인다
    document.documentElement.style.backgroundColor = color
    document.body.style.backgroundColor = color
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  }, [pathname])
}
