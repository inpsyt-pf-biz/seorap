import { describe, expect, it } from 'vitest'
import { theme } from './seorap'

describe('theme', () => {
  it('한글은 단어 중간에서 끊지 않고, 긴 주소·토큰은 넘치지 않게 끊는다', () => {
    const overrides = theme.components?.MuiCssBaseline?.styleOverrides as { body?: Record<string, string> } | undefined
    expect(overrides?.body).toMatchObject({ wordBreak: 'keep-all', overflowWrap: 'anywhere' })
  })
})
