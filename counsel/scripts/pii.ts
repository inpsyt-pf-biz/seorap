// 주문자 이름·연락처를 원장에 넣기 전에 암호화·HMAC 처리한다. 서랍 _shared/crypto.ts 와 같은 형식(AES-GCM v1.iv.ct, HMAC-SHA256 hex)이다.
// 키는 부르는 쪽이 넘긴다. 로컬 시드·시험은 counsel/.env.local 의 가짜 키를, 운영 연동은 서버 비밀값을 쓴다.
import { maskOrderer, type OrdererPlain, type OrdererProtected } from '../core/naverIntake.ts'

const enc = new TextEncoder()
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
// 서랍 crypto.ts 의 decodeKey 와 같은 규칙: base64 로 32바이트가 아니면 멈춘다(짧은 HMAC 키는 연락처 해시를 되돌릴 수 있게 만든다)
function raw(name: string, key: string): Uint8Array<ArrayBuffer> {
  let bytes: Uint8Array<ArrayBuffer>
  try { bytes = Uint8Array.from(atob(key.trim()), (c) => c.charCodeAt(0)) } catch { throw new Error(`${name} must be base64 of 32 bytes`) }
  if (bytes.length !== 32) throw new Error(`${name} must be base64 of 32 bytes`)
  return bytes
}

export type PiiKeys = { encKey: string; hmacKey: string }

export function piiTools(keys: PiiKeys) {
  const aes = crypto.subtle.importKey('raw', raw('encKey', keys.encKey), 'AES-GCM', false, ['encrypt'])
  const mac = crypto.subtle.importKey('raw', raw('hmacKey', keys.hmacKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const encrypt = async (plain: string) => {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes, enc.encode(plain)))
    return `v1.${b64(iv)}.${b64(ct)}`
  }
  const hmac = async (value: string) => {
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await mac, enc.encode(value)))
    return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return {
    hmac,
    // 신청서 연락처와 짝을 맞출 때도 같은 함수를 쓴다(숫자만 남긴 번호)
    phoneHash: (digits: string) => hmac(`phone:${digits}`),
    async protect(plain: OrdererPlain | null): Promise<OrdererProtected | null> {
      if (!plain) return null
      const m = maskOrderer(plain)
      return {
        name_enc: plain.name ? await encrypt(plain.name) : null,
        name_masked: m.name_masked,
        tel_enc: plain.tel ? await encrypt(plain.tel) : null,
        tel_masked: m.tel_masked,
        tel_hash: m.tel_digits ? await hmac(`phone:${m.tel_digits}`) : null,
        orderer_no_hash: plain.ordererNo ? await hmac(`orderer:${plain.ordererNo}`) : null,
      }
    },
  }
}
