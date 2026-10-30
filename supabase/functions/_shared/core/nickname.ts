// 닉네임 규칙 (설정 화면). 검사를 전달할 때 받는 분 화면과 알림톡에 "○○님이 보낸 심리검사예요"로 들어간다.
// 알림톡 변수로도 쓰이므로 한글·영문·숫자·띄어쓰기만, 12자까지 받는다. 화면과 서버가 같은 함수로 검사한다
export const NICKNAME_MAX = 12
export type NicknameProblem = 'empty' | 'too_long' | 'chars'

export function checkNickname(v: unknown): NicknameProblem | null {
  if (typeof v !== 'string') return 'chars'
  const s = v.trim()
  if (s.length === 0) return 'empty'
  if ([...s].length > NICKNAME_MAX) return 'too_long'
  if (!/^[가-힣a-zA-Z0-9 ]+$/.test(s)) return 'chars'
  return null
}
