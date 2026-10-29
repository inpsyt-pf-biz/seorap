// 인싸이트 검사 실시 주소. 서랍 주인의 실시하기와 받는 분의 실시하기가 같은 주소로 간다.
// 비어 있어도 기본 주소로, 끝의 / 는 떼고 붙인다
export function platformTestUrl(code: string): string {
  const base = (Deno.env.get('SEORAP_PLATFORM_TEST_URL') || 'https://inpsyt.co.kr/inpsyt/testing').replace(/\/$/, '')
  return `${base}/${encodeURIComponent(code)}`
}
