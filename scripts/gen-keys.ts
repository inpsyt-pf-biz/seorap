// 서랍 비밀값 생성. 출력은 .env 형식. 로컬·미리보기·운영 각각 따로 만든다.
// 운영 키는 잃어버리면 암호문을 되살릴 수 없으므로 비밀번호 관리 도구에 보관한다.
function key(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const env = Deno.args[0] ?? 'local'
console.log(`SEORAP_ENV=${env}`)
console.log(`SEORAP_HMAC_KEY=${key()}`)
console.log(`SEORAP_ENC_KEY_A=${key()}`)
console.log(`SEORAP_ENC_KEY_B=${key()}`)
