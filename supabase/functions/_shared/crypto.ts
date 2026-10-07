// HMAC·AES-GCM·무작위 토큰. 키는 환경변수(base64 32바이트), 처음 쓸 때 읽는다.
const enc = new TextEncoder()
const dec = new TextDecoder()
const keyCache = new Map<string, Promise<CryptoKey>>()

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
function unb64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function envKey(name: string): Uint8Array {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`missing env ${name}`)
  return unb64(v.trim())
}

function hmacKey(): Promise<CryptoKey> {
  if (!keyCache.has('hmac')) {
    keyCache.set('hmac', crypto.subtle.importKey('raw', envKey('SEORAP_HMAC_KEY'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']))
  }
  return keyCache.get('hmac')!
}
function aesKey(name: 'A' | 'B'): Promise<CryptoKey> {
  const id = `aes${name}`
  if (!keyCache.has(id)) {
    keyCache.set(id, crypto.subtle.importKey('raw', envKey(`SEORAP_ENC_KEY_${name}`), 'AES-GCM', false, ['encrypt', 'decrypt']))
  }
  return keyCache.get(id)!
}

export async function hmac(value: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(value)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function phoneHash(digits: string): Promise<string> {
  return hmac(`phone:${digits}`)
}

export async function encrypt(key: 'A' | 'B', plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key), enc.encode(plain)))
  return `v1.${b64(iv)}.${b64(ct)}`
}

export async function decrypt(key: 'A' | 'B', payload: string): Promise<string> {
  const [v, iv, ct] = payload.split('.')
  if (v !== 'v1' || !iv || !ct) throw new Error('bad ciphertext')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(key), unb64(ct))
  return dec.decode(pt)
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export function randomToken(len = 32): string {
  let out = ''
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < 248 && out.length < len) out += ALPHABET[b % 62] // 248 = 62 * 4, 치우침 없이
    }
  }
  return out
}

export function sixDigits(): string {
  const limit = 4_294_000_000 // 1,000,000의 배수 이하만 받는다
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0]
    if (n < limit) return String(n % 1_000_000).padStart(6, '0')
  }
}
