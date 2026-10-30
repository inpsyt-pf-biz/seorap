import { createTheme } from '@mui/material/styles'

declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides { soft: true }
}

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
    // 주문 묶음 판. 하위 검사 카드(흰색)를 담아 종속 관계를 보인다 (10-30 검수)
    group: '#F0EBE1',
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
  // 예전 남색 단계 자리. 상담 어드민(사수 브랜치)이 이 파일을 그대로 가져다 tokens.brand[900~100] 을 쓴다.
  // 남색은 버리고 같은 단계 이름에 청록 계열을 넣어 어드민이 깨지지 않게 한다 (새 화면 코드는 teal 을 쓴다)
  brand: {
    900: '#123836',
    700: '#1E5552',
    500: '#3F7A76',
    300: '#9DC0BB',
    100: '#DDEBE8',
  },
  // 줄 상태 칩의 색. MUI 기본 info·warning 을 쓰지 않고 여기서 직접 칠한다
  tone: {
    neutral: { bg: '#ECE6DA', fg: '#4F493F' },
    teal: { bg: '#DDEBE8', fg: '#1E5552' },
    warm: { bg: '#F6E7C8', fg: '#6E4A0C' },
    caution: { bg: '#F8E1D8', fg: '#8A3B22' },
    muted: { bg: 'transparent', fg: '#6E675C', border: '#CFC6B6' },
  },
  // 넓은 화면의 바깥 바탕(책상). 서랍 컬럼이 그 위에 한 장의 판으로 서 보이게 한 단계 짙게 깐다 (10-29 검수: 컬럼과 바깥이 같은 색이라 미완성처럼 보임)
  desk: {
    open: '#E3DACA',
    closed: '#123836',
    edge: 'rgba(34, 32, 28, 0.08)',
    shadow: 'rgba(34, 32, 28, 0.10)',
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
  // 브랜드 벡터 (로고 C1 손잡이, 리디바탕 "서랍" 윤곽선). 원본: Works-archive assets/brand/seorap-logo-c1-*.svg · seorap-wordmark-ridibatang.svg
  // 워드마크는 글꼴 없이도 같은 모양으로 보이고, 색은 글자색(currentColor)을 따른다
  brandVector: {
    handlePath: 'M35 75C47.5 86.25 112.5 86.25 125 75',
    wordmarkViewBox: '31 -782 1824 960',
    parentViewBox: '69 -782 3630 960',
    parentPath: 'M686 -73C704 -70 734 -71 745 -74C753 -76 755 -82 756 -91C760 -125 767 -196 767 -238V-742C767 -750 763 -754 752 -758C723 -769 655 -782 624 -782C620 -782 616 -781 613 -776C609 -770 603 -754 600 -742C628 -736 657 -724 669 -715C681 -706 686 -702 686 -687ZM298 -252C442 -252 527 -349 527 -467C527 -585 442 -682 298 -682C154 -682 69 -585 69 -467C69 -349 154 -252 298 -252ZM298 -318C209 -318 151 -381 151 -467C151 -553 209 -616 298 -616C387 -616 445 -553 445 -467C445 -381 387 -318 298 -318ZM341 143H795C801 125 806 91 806 80C806 68 801 66 787 66C777 66 701 77 663 77H366V-129C366 -137 362 -142 351 -146C323 -156 267 -160 236 -160C232 -160 228 -159 225 -154C222 -148 219 -134 218 -121C243 -119 263 -111 274 -103C283 -97 285 -90 285 -75V82C285 122 299 143 341 143Z M1607 176C1625 179 1654 178 1665 175C1673 173 1675 167 1676 158C1680 124 1687 53 1687 11V-334H1843C1849 -353 1855 -381 1855 -393C1855 -405 1850 -407 1836 -407C1826 -407 1762 -397 1723 -397H1687V-742C1687 -750 1683 -754 1672 -758C1643 -769 1576 -782 1545 -782C1541 -782 1537 -781 1534 -776C1530 -770 1524 -752 1521 -740C1549 -734 1578 -722 1590 -713C1602 -704 1607 -700 1607 -685ZM1195 -98C1203 -93 1210 -93 1216 -100C1266 -154 1324 -259 1371 -363C1414 -301 1456 -235 1500 -165C1519 -177 1541 -197 1553 -210C1559 -217 1559 -224 1553 -231C1499 -294 1448 -359 1397 -425C1427 -500 1448 -568 1452 -609C1453 -622 1449 -629 1441 -635C1412 -656 1349 -680 1327 -680C1324 -680 1322 -679 1319 -676C1312 -669 1302 -655 1297 -644C1332 -630 1366 -606 1361 -573C1351 -509 1321 -422 1280 -335L1172 -454C1199 -514 1218 -568 1222 -599C1223 -612 1219 -619 1211 -625C1182 -646 1119 -670 1097 -670C1094 -670 1092 -669 1089 -666C1082 -659 1072 -645 1067 -634C1102 -620 1139 -595 1131 -563C1103 -446 1020 -289 933 -189C946 -177 961 -163 970 -158C978 -153 984 -154 991 -160C1038 -207 1098 -303 1144 -396L1243 -261C1217 -213 1188 -167 1158 -126C1171 -114 1186 -103 1195 -98Z M2560 176C2578 179 2608 178 2619 175C2627 173 2629 167 2630 158C2634 124 2641 53 2641 11V-742C2641 -750 2637 -754 2626 -758C2597 -769 2529 -782 2498 -782C2494 -782 2490 -781 2487 -776C2483 -770 2477 -752 2474 -740C2502 -734 2531 -722 2543 -713C2555 -704 2560 -700 2560 -685ZM2173 -163C2314 -163 2413 -260 2413 -404C2413 -548 2314 -645 2173 -645C2032 -645 1933 -548 1933 -404C1933 -260 2032 -163 2173 -163ZM2173 -231C2082 -231 2015 -297 2015 -404C2015 -510 2082 -577 2173 -577C2264 -577 2331 -510 2331 -404C2331 -297 2264 -231 2173 -231Z M3045 -235H3533C3539 -253 3544 -288 3544 -299C3544 -311 3539 -313 3525 -313C3515 -313 3439 -302 3401 -302H3070V-424H3508C3514 -441 3519 -476 3519 -487C3519 -497 3514 -499 3502 -499C3491 -499 3419 -491 3391 -491H3070V-612H3518C3524 -629 3529 -664 3529 -675C3529 -685 3524 -687 3512 -687C3501 -687 3429 -679 3401 -679H3063C3036 -679 2978 -686 2953 -686C2936 -686 2932 -653 2931 -643C2961 -639 2989 -630 2989 -599V-296C2989 -256 3003 -235 3045 -235ZM2893 -12C2934 -24 2969 -33 3005 -33H3532C3583 -33 3640 -30 3687 -28C3693 -47 3699 -83 3699 -95C3699 -107 3694 -109 3680 -109C3667 -109 3585 -100 3508 -100H2992C2913 -100 2874 -101 2814 -111C2807 -102 2796 -86 2796 -80C2796 -75 2800 -70 2802 -68C2826 -43 2860 -24 2893 -12Z',
    wordmarkPath: 'M696 176C714 179 744 178 755 175C763 173 765 167 766 158C770 124 777 53 777 11V-742C777 -750 773 -754 762 -758C733 -769 665 -782 634 -782C630 -782 626 -781 623 -776C619 -770 613 -752 610 -740C638 -734 667 -722 679 -713C691 -704 696 -700 696 -685V-456H600C561 -456 497 -463 487 -463C473 -463 468 -461 468 -449C468 -437 474 -409 480 -390H696ZM68 -124C76 -118 84 -119 91 -125C145 -168 232 -280 300 -388C374 -301 444 -220 515 -130C531 -142 554 -163 566 -177C572 -184 573 -191 566 -198C489 -276 416 -354 335 -444C375 -513 402 -574 402 -606C402 -619 399 -626 391 -632C362 -653 289 -675 267 -675C264 -675 262 -674 259 -671C253 -664 245 -652 239 -641C274 -627 304 -609 304 -587C304 -491 121 -243 31 -158C44 -143 60 -130 68 -124Z M1069 -244C1196 -244 1428 -279 1596 -319V-244C1614 -241 1644 -242 1655 -245C1663 -247 1665 -253 1666 -262C1670 -296 1677 -367 1677 -409V-472H1843C1849 -491 1855 -519 1855 -531C1855 -543 1850 -545 1836 -545C1826 -545 1762 -535 1723 -535H1677V-742C1677 -750 1673 -754 1662 -758C1633 -769 1565 -782 1534 -782C1530 -782 1526 -781 1523 -776C1519 -770 1513 -754 1510 -742C1538 -736 1567 -724 1579 -715C1591 -706 1596 -702 1596 -687V-379C1451 -343 1218 -311 1094 -311V-435H1400C1408 -435 1413 -441 1413 -452V-657C1413 -677 1404 -684 1388 -684C1363 -684 1298 -680 1273 -680H1108C1069 -680 1025 -679 987 -686C982 -679 972 -660 972 -655C972 -651 975 -648 977 -646C993 -631 1017 -613 1042 -602C1068 -611 1088 -616 1115 -616H1332V-499H1083C1057 -499 1009 -506 985 -506C972 -506 965 -472 964 -463C989 -457 1013 -448 1013 -419V-305C1013 -265 1027 -244 1069 -244ZM1221 156H1637C1652 156 1667 150 1667 125V-179C1667 -189 1664 -194 1655 -198C1631 -208 1583 -216 1552 -217C1548 -217 1545 -216 1542 -211C1538 -205 1534 -189 1533 -179C1564 -175 1587 -160 1587 -133V-81H1257V-154C1257 -164 1254 -169 1245 -173C1221 -183 1173 -191 1142 -192C1138 -192 1135 -191 1132 -186C1128 -180 1124 -164 1123 -154C1154 -150 1177 -135 1177 -108V102C1177 140 1194 156 1221 156ZM1257 90V-15H1587V90Z',
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

const BODY_FONT =
  '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif'
// 리디바탕은 index.html 의 @font-face(font-display: swap)로 불러온다. 늦으면 본문 글꼴로 먼저 보인다
const HEADING_FONT = `"RIDIBatang", ${BODY_FONT}`

export const theme = createTheme({
  palette: {
    primary: { main: tokens.teal[700], dark: tokens.teal[900], light: tokens.teal[500], contrastText: '#FFFFFF' },
    background: { default: tokens.surface.page, paper: tokens.surface[0] },
    text: { primary: tokens.text.primary, secondary: tokens.text.secondary, disabled: tokens.text.disabled },
    divider: tokens.surface[200],
  },
  typography: {
    fontFamily: BODY_FONT,
    // 본문 16 · 보조 14 · 캡션 12 (12 미만 금지).
    // 제목만 리디바탕(굵기 Regular 하나뿐이라 위계는 크기로). 버튼·숫자·코드는 본문 글꼴
    h4: { fontFamily: HEADING_FONT, fontSize: '1.875rem', fontWeight: 400, lineHeight: 1.3, textWrap: 'balance' },
    h5: { fontFamily: HEADING_FONT, fontSize: '1.375rem', fontWeight: 400, lineHeight: 1.4, textWrap: 'balance' },
    h6: { fontFamily: HEADING_FONT, fontSize: '1.1875rem', fontWeight: 400, lineHeight: 1.4, textWrap: 'balance' },
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
      // 바탕색은 html 이 맡는다(경로별 data-surface). 휴대폰 폭에서는 판과 같은 색이라 당겨 내려도 같고,
      // 넓은 화면(520px 이상)에서는 바깥을 책상색으로 깔아 서랍 컬럼(AppFrame)과 구분한다
      styleOverrides: {
        body: { wordBreak: 'keep-all', overflowWrap: 'anywhere', '--seorap-focus': tokens.focus.light, backgroundColor: 'transparent' },
        // 브라우저가 그리는 비밀번호 보기·지우기 아이콘은 테마 밖 모양이라 숨긴다 (10-30 비평 ⑥)
        'input::-ms-reveal, input::-ms-clear': { display: 'none' },
        'html[data-surface="open"]': { backgroundColor: tokens.surface.page },
        'html[data-surface="closed"]': { backgroundColor: tokens.teal[700] },
        '@media (min-width: 520px)': {
          'html[data-surface="open"]': { backgroundColor: tokens.desk.open },
          'html[data-surface="closed"]': { backgroundColor: tokens.desk.closed },
        },
      },
    },
    // 버튼·탭·칩·목록 단추는 모두 ButtonBase 다. 키보드로 왔을 때만 링이 바로 보인다(물결 효과만으로는 부족)
    MuiButtonBase: {
      styleOverrides: { root: { '&.Mui-focusVisible': { outline: '2px solid var(--seorap-focus)', outlineOffset: '2px' } } },
    },
    // soft: 줄 카드의 주 행동. 진한 채움(contained)은 화면당 하나(상담 신청서 작성, 시트의 다음 등)로 아낀다
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: tokens.radius.control,
          variants: [{
            props: { variant: 'soft' },
            style: {
              backgroundColor: tokens.teal[100],
              color: tokens.teal[700],
              '&:hover': { backgroundColor: tokens.teal[50] },
              '&.Mui-disabled': { backgroundColor: tokens.surface[100], color: tokens.text.disabled },
            },
          }],
        },
      },
    },
    // 쪽 배경이 종이색이라 글자 입력 칸은 흰색으로 둔다
    MuiOutlinedInput: {
      // 쨍한 흰색 대신 약관 상자와 같은 옅은 종이색, 테두리는 선택지(Choice)와 같은 선 (10-30 검수: 입력 간 통일감)
      styleOverrides: {
        root: {
          backgroundColor: tokens.surface[50], borderRadius: tokens.radius.control,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.surface[300] },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.teal[500] },
        },
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: tokens.radius.sheet } },
    },
  },
})

// 닫힌 서랍 테마 (입장 화면: 인증번호·비밀번호). 청록 바탕에 종이색 글자, 주 버튼은 종이색 바탕 + 청록 글자.
// 흰 입력 칸 안의 글자는 진한 색으로 되돌리고, 포커스 링은 호박빛으로 바꾼다 (ClosedShell 이 감싼다)
export const closedTheme = createTheme(theme, {
  palette: {
    primary: { main: tokens.surface.page, dark: tokens.surface[0], light: tokens.surface[0], contrastText: tokens.teal[700] },
    background: { default: tokens.teal[700], paper: tokens.surface[0] },
    text: { primary: tokens.surface.page, secondary: tokens.teal[100], disabled: tokens.teal[100] },
    action: { disabled: 'rgba(246, 242, 234, 0.6)', disabledBackground: 'rgba(246, 242, 234, 0.18)' },
  },
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.surface[0],
          borderRadius: tokens.radius.control,
          color: tokens.text.primary,
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.amber[500] },
        },
      },
    },
  },
})
