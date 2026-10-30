import { describe, expect, it } from 'vitest'
import { SPECIALTIES } from '@counsel-core/centers.ts'
import { contrast, theme, tokens } from '@seorap-web/theme/seorap.ts'
import { adminTheme, centerListLook, specialtyColors } from './admin'

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
