// 로컬 시안 전용. 화면은 로컬 상담 툴 스택(56321)에만 붙는다. 실제 정보가 들어갈 길을 처음부터 막는다.
export function isLocalStackUrl(url: string | undefined): url is string {
  return typeof url === 'string' && /^http:\/\/(127\.0\.0\.1|localhost):56321$/.test(url)
}
