import { useEffect, useState } from 'react'

export function useCountdown(targetIso: string | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!targetIso) return
    // 목표 시각이 바뀌면 곧바로 현재 시각으로 맞춘다(타이머가 없던 동안 now가 낡아 있다).
    // oxlint-disable-next-line react/set-state-in-effect
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [targetIso])
  return targetIso ? Math.max(0, Math.ceil((Date.parse(targetIso) - now) / 1000)) : 0
}
