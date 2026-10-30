import { describe, expect, it } from 'vitest'
import { closedTheme, contrast, theme, tokens } from './seorap'

describe('theme', () => {
  it('한글은 단어 중간에서 끊지 않고, 긴 주소·토큰은 넘치지 않게 끊는다', () => {
    const overrides = theme.components?.MuiCssBaseline?.styleOverrides as { body?: Record<string, string> } | undefined
    expect(overrides?.body).toMatchObject({ wordBreak: 'keep-all', overflowWrap: 'anywhere' })
  })

  it('색 ①: 주 색은 깊은 청록, 쪽 배경은 종이색, 카드는 흰색이다 (01-plan §0 10-29)', () => {
    expect(theme.palette.primary.main).toBe('#1E5552')
    expect(tokens.surface.page).toBe('#F6F2EA')
    expect(theme.palette.background.default).toBe(tokens.surface.page)
    expect(theme.palette.background.paper).toBe('#FFFFFF')
  })

  it('남색·로고 파랑은 토큰에 남아 있지 않다', () => {
    const all = JSON.stringify(tokens).toUpperCase()
    expect(all).not.toContain('#2B398F')
    expect(all).not.toContain('#0088FF')
  })

  it('글자 입력 칸은 쨍한 흰색이 아니라 약관 상자와 같은 옅은 종이색이다 (10-30 검수)', () => {
    const root = theme.components?.MuiOutlinedInput?.styleOverrides?.root as { backgroundColor?: string } | undefined
    expect(root?.backgroundColor).toBe(tokens.surface[50])
  })
  it('주문 묶음 판(group) 색 위에서도 보조 글자가 4.5:1 이상이다', () => {
    expect(contrast(tokens.text.secondary, tokens.surface.group)).toBeGreaterThanOrEqual(4.5)
  })

  it('주 컬럼 폭의 기준값은 하나다', () => {
    expect(tokens.layout.maxWidth).toBe(480)
  })

  it('모서리 반경은 px 문자열 토큰이다 (sx 숫자는 테마 배수로 커지므로 쓰지 않는다)', () => {
    expect(tokens.radius).toEqual({ control: '10px', card: '12px', sheet: '16px', pill: '999px' })
  })

  it('제목(h4~h6)은 리디바탕 한 굵기, 본문·버튼은 Pretendard 그대로다', () => {
    for (const v of ['h4', 'h5', 'h6'] as const) {
      expect(String(theme.typography[v].fontFamily)).toMatch(/^"RIDIBatang"/)
      expect(theme.typography[v].fontWeight).toBe(400)
    }
    expect(String(theme.typography.body1.fontFamily ?? theme.typography.fontFamily)).toMatch(/Pretendard/)
    expect(String(theme.typography.button.fontFamily ?? theme.typography.fontFamily)).toMatch(/Pretendard/)
  })

  it('리디바탕은 font-display: swap 으로 불러와 글꼴이 늦어도 글자가 먼저 보인다, 파비콘은 C1 로고', async () => {
    const html = (await import('../../index.html?raw')).default as string
    expect(html).toMatch(/@font-face\s*{[^}]*font-family:\s*'RIDIBatang'[^}]*font-display:\s*swap/)
    expect(html).toContain('href="/brand/seorap-logo.svg"')
  })

  it('키보드 포커스 링이 모든 버튼·탭·칩에 걸린다 (ButtonBase)', () => {
    const root = theme.components?.MuiButtonBase?.styleOverrides?.root as Record<string, Record<string, string>> | undefined
    expect(root?.['&.Mui-focusVisible']).toMatchObject({ outline: '2px solid var(--seorap-focus)', outlineOffset: '2px' })
  })
})

describe('명도 대비 (글자 4.5:1 이상)', () => {
  it('대비 계산이 알려진 값과 맞다', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })

  const pairs: [string, string, string][] = [
    ['본문 / 종이', tokens.text.primary, tokens.surface.page],
    ['본문 / 흰 카드', tokens.text.primary, tokens.surface[0]],
    ['보조 글자 / 종이', tokens.text.secondary, tokens.surface.page],
    ['보조 글자 / 흰 카드', tokens.text.secondary, tokens.surface[0]],
    ['청록 글자 / 종이', tokens.teal[700], tokens.surface.page],
    ['청록 글자 / 흰 카드', tokens.teal[700], tokens.surface[0]],
    ['흰 글자 / 청록 버튼', '#FFFFFF', tokens.teal[700]],
    ['종이 글자 / 청록(닫힌 서랍)', tokens.surface.page, tokens.teal[700]],
    ['청록 글자 / 옅은 청록 버튼', tokens.teal[700], tokens.teal[100]],
    ...Object.entries(tokens.tone).map(([k, v]) => [`칩 ${k}`, v.fg, v.bg === 'transparent' ? tokens.surface[0] : v.bg] as [string, string, string]),
  ]
  it.each(pairs)('%s', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('포커스 링은 종이·흰 카드 위에서 3:1 이상, 닫힌 서랍(청록) 위의 호박 링도 3:1 이상', () => {
    expect(contrast(tokens.focus.light, tokens.surface.page)).toBeGreaterThanOrEqual(3)
    expect(contrast(tokens.focus.light, tokens.surface[0])).toBeGreaterThanOrEqual(3)
    expect(contrast(tokens.focus.onTeal, tokens.teal[700])).toBeGreaterThanOrEqual(3)
  })
})

// 컬럼 폭과 색은 이 테마 파일에서만 정한다. 화면 코드에 480 이나 색 값을 직접 쓰면 이 시험이 막는다.
// (개발 전용 발신함 화면은 720 폭을 따로 쓴다)
describe('화면 코드는 컬럼 폭·색·반경 숫자를 직접 쓰지 않는다', () => {
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
  it('판 안의 화면은 100dvh 를 직접 쓰지 않고 판 높이(--frame-min-h)를 따른다 (넓은 화면에서 판 아래가 밀려나지 않게)', () => {
    expect(screens.filter(([path, src]) => path !== '../App.tsx' && /100dvh/.test(src)).map(([path]) => path)).toEqual([])
    const app = screens.find(([path]) => path === '../App.tsx')?.[1] ?? ''
    expect(app).toMatch(/'--frame-min-h'/)
  })
  it('borderRadius 에 숫자를 쓰지 않는다 (테마 12px 의 배수가 되어 24·36px 로 커진다)', () => {
    expect(screens.filter(([, src]) => /borderRadius:\s*\d/.test(src)).map(([path]) => path)).toEqual([])
  })
})

describe('닫힌 서랍 테마 (입장 화면)', () => {
  it('바탕은 청록, 글자·주 버튼은 종이색, 주 버튼 글자는 청록이다', () => {
    expect(closedTheme.palette.background.default).toBe(tokens.teal[700])
    expect(closedTheme.palette.text.primary).toBe(tokens.surface.page)
    expect(closedTheme.palette.primary.main).toBe(tokens.surface.page)
    expect(closedTheme.palette.primary.contrastText).toBe(tokens.teal[700])
  })
  it('보조 글자도 청록 위에서 4.5:1 이상이다', () => {
    expect(contrast(closedTheme.palette.text.secondary, tokens.teal[700])).toBeGreaterThanOrEqual(4.5)
  })
  it('흰 입력 칸 안의 글자는 진한 글자색이다 (종이색 글자가 흰 칸에 묻히지 않게)', () => {
    const root = closedTheme.components?.MuiOutlinedInput?.styleOverrides?.root as { color?: string } | undefined
    expect(root?.color).toBe(tokens.text.primary)
  })
})

describe('토큰 공개 모양 (상담 어드민이 그대로 가져다 쓴다)', () => {
  it('공개 키가 고정돼 있다: 이름을 바꾸면 이 시험이 먼저 알린다', () => {
    expect(Object.keys(tokens).sort()).toEqual(
      ['amber', 'brand', 'brandVector', 'desk', 'focus', 'layout', 'logo', 'radius', 'surface', 'teal', 'text', 'tone'].sort(),
    )
  })
  it('brand 는 예전처럼 900·700·500·300·100 색 단계다 (어드민 호환. 값은 청록 계열)', () => {
    for (const k of [900, 700, 500, 300, 100] as const) expect(tokens.brand[k]).toMatch(/^#[0-9A-F]{6}$/)
    expect(tokens.brand[700]).toBe(tokens.teal[700])
  })
  it('로고·워드마크 벡터는 brandVector 에 있다', () => {
    expect(tokens.brandVector.handlePath).toMatch(/^M/)
    expect(tokens.brandVector.wordmarkPath).toMatch(/^M/)
  })
})

describe('바깥 바탕(책상) 색', () => {
  const css = theme.components?.MuiCssBaseline?.styleOverrides as Record<string, Record<string, Record<string, string>>>
  it('휴대폰 폭에서는 바깥도 판과 같은 색(당겨 내려도 같은 색)', () => {
    expect(css['html[data-surface="open"]']).toMatchObject({ backgroundColor: tokens.surface.page })
    expect(css['html[data-surface="closed"]']).toMatchObject({ backgroundColor: tokens.teal[700] })
  })
  it('넓은 화면에서는 바깥을 한 단계 짙게 깔아 컬럼 판과 구분한다', () => {
    const wide = css['@media (min-width: 520px)']
    expect(wide['html[data-surface="open"]']).toMatchObject({ backgroundColor: tokens.desk.open })
    expect(wide['html[data-surface="closed"]']).toMatchObject({ backgroundColor: tokens.desk.closed })
    expect(tokens.desk.open).not.toBe(tokens.surface.page)
    expect(tokens.desk.closed).not.toBe(tokens.teal[700])
  })
})

describe('위계와 브라우저 기본값 (10-30 비평)', () => {
  it('제목 크기는 30·22·19px 로 벌려, 굵은 본문보다 크기로 앞선다', () => {
    expect(theme.typography.h4.fontSize).toBe('1.875rem')
    expect(theme.typography.h5.fontSize).toBe('1.375rem')
  })
  it('제목은 줄을 고르게 나눈다(외톨이 단어 방지)', () => {
    for (const v of ['h4', 'h5', 'h6'] as const) expect((theme.typography[v] as Record<string, unknown>).textWrap).toBe('balance')
  })
  it('브라우저 기본 비밀번호 보기·지우기 아이콘을 숨긴다', () => {
    const css = theme.components?.MuiCssBaseline?.styleOverrides as Record<string, unknown>
    expect(css['input::-ms-reveal, input::-ms-clear']).toEqual({ display: 'none' })
  })
})
