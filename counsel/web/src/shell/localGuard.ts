// 로컬 시안 전용. 화면은 로컬 상담 툴 스택(56321)에만 붙는다. 실제 정보가 들어갈 길을 처음부터 막는다.
export function isLocalStackUrl(url: string | undefined): url is string {
  return typeof url === 'string' && /^http:\/\/(127\.0\.0\.1|localhost):56321$/.test(url)
}

// 검수용 미리보기 프로젝트(seorap-preview, 가짜 데이터만). 운영 프로젝트는 여기에 넣지 않는다.
export const PREVIEW_STACK_URL = 'https://wmbjnwmfqoquanrpgiqh.supabase.co'

// 로컬 스택, 또는 VITE_COUNSEL_ENV=preview 로 빌드했을 때의 미리보기 프로젝트만 허용한다.
export function isAllowedStackUrl(url: string | undefined, env: string | undefined): url is string {
  return isLocalStackUrl(url) || (env === 'preview' && url === PREVIEW_STACK_URL)
}
