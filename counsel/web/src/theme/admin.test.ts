import { describe, expect, it } from 'vitest'
import { theme } from '@seorap-web/theme/seorap.ts'
import { adminTheme } from './admin'

describe('어드민 테마', () => {
  it('서랍 테마의 색과 글꼴을 그대로 이어받는다', () => {
    expect(adminTheme.palette.primary.main).toBe(theme.palette.primary.main)
    expect(adminTheme.typography.fontFamily).toBe(theme.typography.fontFamily)
  })
})

// 서랍과 같은 규칙: 화면 코드에 색 값이나 서랍 주 컬럼 폭(480)을 직접 쓰지 않는다. 테마 파일만 예외.
describe('화면 코드는 색·폭을 직접 쓰지 않는다', () => {
  const sources = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const screens = Object.entries(sources).filter(([path]) => !/\.test\.tsx?$/.test(path) && path !== './admin.ts')

  it('시험 대상 파일을 찾았다', () => {
    expect(screens.length).toBeGreaterThan(8)
  })
  it('480 을 직접 쓰지 않는다', () => {
    expect(screens.filter(([, src]) => /\b480\b/.test(src)).map(([path]) => path)).toEqual([])
  })
  it('색 값(#hex)을 직접 쓰지 않는다', () => {
    expect(screens.filter(([, src]) => /#[0-9A-Fa-f]{3,8}\b/.test(src)).map(([path]) => path)).toEqual([])
  })
})
