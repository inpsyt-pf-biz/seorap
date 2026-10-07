import { describe, expect, it } from 'vitest'
import { theme, tokens } from './seorap'

describe('theme', () => {
  it('한글은 단어 중간에서 끊지 않고, 긴 주소·토큰은 넘치지 않게 끊는다', () => {
    const overrides = theme.components?.MuiCssBaseline?.styleOverrides as { body?: Record<string, string> } | undefined
    expect(overrides?.body).toMatchObject({ wordBreak: 'keep-all', overflowWrap: 'anywhere' })
  })

  it('쪽 배경은 브랜드 남색의 옅은 색이고, 카드(종이)는 흰색이다', () => {
    expect(tokens.surface.page).toBe('#EEF0F7')
    expect(theme.palette.background.default).toBe(tokens.surface.page)
    expect(theme.palette.background.paper).toBe('#FFFFFF')
  })

  it('글자 입력 칸은 쪽 배경 위에서도 흰색이다', () => {
    const root = theme.components?.MuiOutlinedInput?.styleOverrides?.root as { backgroundColor?: string } | undefined
    expect(root?.backgroundColor).toBe('#FFFFFF')
  })

  it('주 컬럼 폭의 기준값은 하나다', () => {
    expect(tokens.layout.maxWidth).toBe(480)
  })
})

// 컬럼 폭과 색은 이 테마 파일에서만 정한다. 화면 코드에 480 이나 색 값을 직접 쓰면 이 시험이 막는다.
// (개발 전용 발신함 화면은 720 폭을 따로 쓴다)
describe('화면 코드는 컬럼 폭·색을 직접 쓰지 않는다', () => {
  const sources = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  // 경로는 이 파일 기준이라 테마 파일 자신은 './seorap.ts' 로 잡힌다
  const screens = Object.entries(sources).filter(([path]) => !/\.test\.tsx?$/.test(path) && path !== './seorap.ts')

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
