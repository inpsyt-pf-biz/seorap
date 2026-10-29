import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { tokens } from '../theme/seorap'

// 닫힌 서랍(입장·비밀번호 설정)인 경로인가. 입장 주소는 /{토큰} 한 칸이고, 같은 한 칸 주소 중 정해진 화면은 뺀다
const OPEN_SINGLE = new Set(['/', '/box', '/help', '/pin'])
export function isClosedPath(pathname: string): boolean {
  if (pathname === '/pin') return true
  return /^\/[^/]+$/.test(pathname) && !OPEN_SINGLE.has(pathname)
}

export type Surface = 'closed' | 'open'

// 경로에 맞춰 html 에 data-surface 를 달고(바탕색은 테마의 CSS 가 칠한다), 휴대폰 상단 막대(theme-color)도 맞춘다.
// 화면 안쪽 판만 칠하면 불러오는 동안·화면 전환 순간·당겨 내릴 때 다른 색이 비친다 (10-29 건우님 검수)
export function usePageSurface(): Surface {
  const { pathname } = useLocation()
  const surface: Surface = isClosedPath(pathname) ? 'closed' : 'open'
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-surface', surface)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface === 'closed' ? tokens.teal[700] : tokens.surface.page)
  }, [surface])
  return surface
}
