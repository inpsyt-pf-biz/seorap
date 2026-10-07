// 개발 전용 기능(가짜 문자, dev 우편함, 시드)은 허용 목록으로만 연다.
// SEORAP_ENV 가 비어 있거나 오타여도 닫힌 채로 있어야 한다.
export function isDevEnv(): boolean {
  return ['local', 'preview'].includes(Deno.env.get('SEORAP_ENV') ?? '')
}
