import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { tokens } from '../theme/seorap'

const SHELL_PATHS = new Set(['/box', '/box/history'])

// 휴대폰 상단 막대(theme-color)를 화면 위쪽 색과 잇는다. 바탕은 모든 화면이 종이색이고 (75:20:5, 10-30),
// 서랍·전달 이력은 위에 청록 머리 판(BoxHeader)이 있으므로 상단 막대도 청록으로 이어 준다
export function useThemeColor(): void {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    const tealTop = SHELL_PATHS.has(pathname)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tealTop ? tokens.teal[700] : tokens.surface.page)
  }, [pathname])
}
