import { createTheme } from '@mui/material/styles'

// 서랍 테마 토큰. 색·반경·로고는 이 파일에서만 바꾼다.
// 색 ① (01-plan §0 10-29): "닫힌 서랍은 고요하게, 열린 서랍은 따뜻하게". 깊은 청록 + 종이 + 호박빛.
// 대비는 seorap.test.ts 가 계산해서 막는다 (글자 4.5:1, 포커스 링 3:1)
export const tokens = {
  // 주 색. 버튼·강조·닫힌 서랍(입장 화면) 바탕
  teal: {
    900: '#123836',
    700: '#1E5552',
    500: '#3F7A76',
    100: '#DDEBE8',
    50: '#EEF5F3',
  },
  // 열었을 때 드러나는 온기. 로고 손잡이와 "전달함"처럼 사람 사이의 표시에만
  amber: {
    500: '#F2B24C',
    100: '#F6E7C8',
    800: '#6E4A0C',
  },
  surface: {
    // 쪽 배경(종이). 흰 카드·입력 칸이 그 위에 놓인다
    page: '#F6F2EA',
    0: '#FFFFFF',
    50: '#FAF8F3',
    100: '#ECE6DA',
    200: '#E6DFD2',
    300: '#CFC6B6',
  },
  text: {
    primary: '#22201C',
    secondary: '#6E675C',
    disabled: '#9A9385',
  },
  // 줄 상태 칩의 색. MUI 기본 info·warning 을 쓰지 않고 여기서 직접 칠한다
  tone: {
    neutral: { bg: '#ECE6DA', fg: '#4F493F' },
    teal: { bg: '#DDEBE8', fg: '#1E5552' },
    warm: { bg: '#F6E7C8', fg: '#6E4A0C' },
    caution: { bg: '#F8E1D8', fg: '#8A3B22' },
    muted: { bg: 'transparent', fg: '#6E675C', border: '#CFC6B6' },
  },
  // 키보드 포커스 링. 종이·흰 바탕에서는 청록, 닫힌 서랍(청록 바탕)에서는 호박빛
  focus: { light: '#3F7A76', onTeal: '#F2B24C' },
  // sx 의 borderRadius 숫자는 테마 shape(12px)의 배수로 계산돼 24·36px 이 된다. 반경은 이 문자열만 쓴다
  radius: { control: '10px', card: '12px', sheet: '16px', pill: '999px' },
  // 화면은 폰 한 칸짜리 주 컬럼 하나다 (PC 별도 배치 없음). 시트·토스트·페이지 폭은 모두 이 값을 따른다
  layout: { maxWidth: 480 },
  logo: {
    src: '/brand/seorap-logo.png',
    alt: '인싸이트 서랍',
  },
} as const

// WCAG 상대 휘도 대비. 시험에서 토큰 조합을 검사할 때 쓴다
export function contrast(fg: string, bg: string): number {
  const lum = (hex: string) => {
    const n = hex.replace('#', '')
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

export const theme = createTheme({
  palette: {
    primary: { main: tokens.teal[700], dark: tokens.teal[900], light: tokens.teal[500], contrastText: '#FFFFFF' },
    background: { default: tokens.surface.page, paper: tokens.surface[0] },
    text: { primary: tokens.text.primary, secondary: tokens.text.secondary, disabled: tokens.text.disabled },
    divider: tokens.surface[200],
  },
  typography: {
    fontFamily:
      '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif',
    // 본문 16 · 보조 14 · 캡션 12 (12 미만 금지)
    h4: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.35 },
    h5: { fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.4 },
    h6: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: '1rem', fontWeight: 400, lineHeight: 1.5 },
    body2: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.5 },
    caption: { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.5 },
    button: { fontSize: '1rem', fontWeight: 600, textTransform: 'none' },
  },
  shape: { borderRadius: 12 },
  components: {
    // 한글은 낱말 중간에서 줄을 바꾸지 않는다(keep-all). 띄어쓰기 없는 긴 주소·토큰은 넘치지 않게 아무 곳에서나 끊는다.
    // 포커스 링 색은 CSS 변수로 두어, 닫힌 서랍 화면이 호박빛으로 바꿔 쓸 수 있게 한다
    MuiCssBaseline: {
      styleOverrides: { body: { wordBreak: 'keep-all', overflowWrap: 'anywhere', '--seorap-focus': tokens.focus.light } },
    },
    // 버튼·탭·칩·목록 단추는 모두 ButtonBase 다. 키보드로 왔을 때만 링이 바로 보인다(물결 효과만으로는 부족)
    MuiButtonBase: {
      styleOverrides: { root: { '&.Mui-focusVisible': { outline: '2px solid var(--seorap-focus)', outlineOffset: '2px' } } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 44, borderRadius: tokens.radius.control } },
    },
    // 쪽 배경이 종이색이라 글자 입력 칸은 흰색으로 둔다
    MuiOutlinedInput: {
      styleOverrides: { root: { backgroundColor: tokens.surface[0], borderRadius: tokens.radius.control } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: tokens.radius.sheet } },
    },
  },
})
