import { describe, expect, it } from 'vitest'
import { SPECIALTIES } from '@counsel-core/centers.ts'
import { contrast, theme, tokens } from '@seorap-web/theme/seorap.ts'
import { adminSheet, adminTheme, centerListLook, specialtyColors } from './admin'

describe('어드민 테마', () => {
  it('서랍 테마의 색과 글꼴을 그대로 이어받는다', () => {
    expect(adminTheme.palette.primary.main).toBe(theme.palette.primary.main)
    expect(adminTheme.typography.fontFamily).toBe(theme.typography.fontFamily)
  })
})

// 원색인지 보는 간단한 잣대: RGB 성분의 최대-최소 차(0~1). 클수록 채도가 높다
const chroma = (hex: string) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return Math.max(...v) - Math.min(...v)
}

// 서랍 앱과 같은 종이 바탕 배색(75:20:5)에 맞춘다 (10-30 건우님 결정)
describe('분야 태그 색 (낮은 채도, 서랍 칩과 같은 계열)', () => {
  it.each(SPECIALTIES)('%s: 글자 대비 4.5:1 이상', (s) => {
    expect(contrast(specialtyColors[s].fg, specialtyColors[s].bg)).toBeGreaterThanOrEqual(4.5)
  })
  it('다섯 분야의 바탕색이 서로 다르다', () => {
    expect(new Set(SPECIALTIES.map((s) => specialtyColors[s].bg)).size).toBe(SPECIALTIES.length)
  })
  it('원색 글자를 쓰지 않는다: 글자색 채도가 서랍 칩(주의 표시)보다 높지 않다', () => {
    const limit = chroma(tokens.tone.caution.fg)
    expect(SPECIALTIES.filter((s) => chroma(specialtyColors[s].fg) > limit)).toEqual([])
  })
})

describe('센터 아이콘', () => {
  it('그라데이션 없이 옅은 청록 바탕에 청록 아이콘이다', () => {
    expect(centerListLook.avatarBg).toBe(tokens.teal[100])
    expect(centerListLook.avatarFg).toBe(tokens.teal[700])
  })
})

// 10-30 건우님 검수(여러 번): "메뉴마다 바탕과 요소 사이 구분이 없다". 서랍 고객 화면의 옅은 종이 바탕을 그대로 쓰면
// 흰 판·입력 칸이 바탕에 묻힌다. 어드민은 바탕을 한 단계 짙게 깔고, 판·입력 칸은 흰색에 바탕보다 진한 테두리를 둔다
describe('어드민 바탕과 판·입력 칸의 구분', () => {
  const bg = adminTheme.palette.background.default
  it('본문 바탕은 흰 판(카드·표)과 눈에 띄게 다르다 (대비 1.2 이상)', () => {
    expect(adminTheme.palette.background.paper).toBe(tokens.surface[0])
    expect(contrast(bg, tokens.surface[0])).toBeGreaterThanOrEqual(1.2)
  })
  it('입력 칸은 흰색이라 바탕 위에서 떠 보인다', () => {
    const root = adminTheme.components?.MuiOutlinedInput?.styleOverrides?.root as { backgroundColor?: string }
    expect(root.backgroundColor).toBe(tokens.surface[0])
  })
  it('판 테두리는 바탕보다 진하다', () => {
    const root = adminTheme.components?.MuiPaper?.styleOverrides?.root as { border?: string }
    const color = /#[0-9A-F]{6}/i.exec(root.border ?? '')?.[0] ?? ''
    expect(contrast(color, bg)).toBeGreaterThanOrEqual(1.25)
  })
  it('창 바탕(html)도 본문과 같은 색이라 넓은 화면·당겨 내릴 때 다른 색이 비치지 않는다', () => {
    const css = adminTheme.components?.MuiCssBaseline?.styleOverrides as Record<string, Record<string, unknown>>
    expect(css.html).toMatchObject({ backgroundColor: bg })
    expect((css['@media (min-width: 520px)'] as Record<string, Record<string, unknown>>).html).toMatchObject({ backgroundColor: bg })
  })
})

// 10-30 건우님 검수: "그릇 없이 밥 먹는 것 같다". 제목·요약·검색 칸이 바닥에 그대로 놓이고 기간 칸만 혼자 하얬다.
// 모든 메뉴의 본문은 어드민 틀이 흰 판(adminSheet) 하나에 담는다. 바닥은 판 바깥으로만 보인다
describe('본문은 흰 판 하나에 담긴다', () => {
  it('판은 흰색이고 바닥과 눈에 띄게 다르며, 바닥보다 진한 테두리가 있다', () => {
    expect(adminSheet.bgcolor).toBe(tokens.surface[0])
    expect(contrast(adminSheet.bgcolor, adminTheme.palette.background.default)).toBeGreaterThanOrEqual(1.2)
    expect(adminSheet.border).toContain(tokens.surface[300])
  })
  it('어드민 틀이 화면(Outlet)을 이 판 안에 넣는다', () => {
    const shell = Object.entries(import.meta.glob('../pages/admin/counsel/AdminShell.tsx', { query: '?raw', import: 'default', eager: true }))[0][1] as string
    expect(shell).toMatch(/sx=\{adminSheet\}[\s\S]*<Outlet \/>/)
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
