// 서랍 입장 PIN 규칙 (build-spec §4-2a). 화면과 서버가 같은 함수로 검사한다.
export type PinProblem = 'format' | 'weak'

export function checkPin(pin: unknown): PinProblem | null {
  if (typeof pin !== 'string' || !/^[0-9]{6}$/.test(pin)) return 'format'
  const d = [...pin].map(Number)
  const steps = d.slice(1).map((n, i) => n - d[i])
  // 같은 숫자 6개(111111), 하나씩 오르거나 내리는 숫자(123456·654321)
  if (steps.every((s) => s === 0) || steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'weak'
  return null
}
