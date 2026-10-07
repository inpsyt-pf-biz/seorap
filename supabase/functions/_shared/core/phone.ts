// 번호는 이 파일의 함수로만 다룬다 (수집·전달·OTP·번호 변경 공용)
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('0082')) d = d.slice(2)
  if (d.startsWith('82')) {
    const rest = d.slice(2)
    d = rest.startsWith('0') ? rest : '0' + rest
  }
  if (!/^(010\d{8}|01[16789]\d{7,8})$/.test(d)) return null
  return d
}

export function formatPhone(d: string): string {
  return d.length === 11
    ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
    : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}

export function maskPhone(d: string): string {
  const parts = formatPhone(d).split('-')
  return `${parts[0]}-****-${parts[2]}`
}

export function last4(d: string): string {
  return d.slice(-4)
}

export function maskName(name: string): string {
  const t = name.trim()
  if (t.length <= 1) return t
  if (t.length === 2) return t[0] + '*'
  return t[0] + '*'.repeat(t.length - 2) + t[t.length - 1]
}

export function formatPhoneInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}
