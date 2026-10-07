// 서랍 비밀값 생성. 출력은 .env 형식. 로컬·미리보기·운영 각각 따로 만든다.
// 사용: deno run scripts/gen-keys.ts <local|preview|production>  (환경을 꼭 적는다. 빠뜨리거나 틀리면 아무것도 만들지 않는다)
// 운영 키는 잃어버리면 암호문을 되살릴 수 없으므로 비밀번호 관리 도구에 보관한다.
const ENVS = ['local', 'preview', 'production']
const env = Deno.args[0] ?? ''
if (!ENVS.includes(env)) {
  console.error('usage: deno run scripts/gen-keys.ts <local|preview|production>')
  Deno.exit(1)
}

function bytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}
function key(): string {
  let s = ''
  for (const b of bytes(32)) s += String.fromCharCode(b)
  return btoa(s)
}
// 머리글에 그대로 넣는 값이라 16진수로 만든다
function hexKey(): string {
  return Array.from(bytes(32), (b) => b.toString(16).padStart(2, '0')).join('')
}

console.log(`SEORAP_ENV=${env}`)
console.log(`SEORAP_HMAC_KEY=${key()}`)
console.log(`SEORAP_ENC_KEY_A=${key()}`)
console.log(`SEORAP_ENC_KEY_B=${key()}`)
// 미리보기만: 함수 주소로 바로 오는 /dev/outbox 요청을 막는 키. 같은 값을 Vercel Preview 의 VITE_SEORAP_DEV_OUTBOX_KEY 에 넣는다.
if (env === 'preview') console.log(`SEORAP_DEV_OUTBOX_KEY=${hexKey()}`)
