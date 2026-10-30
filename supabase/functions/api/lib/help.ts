import { defaultHelp, type HelpContent, normalizeHelp } from '../../_shared/core/helpContent.ts'
import { counsel } from './counsel.ts'
import { getSettings } from './settings.ts'

// 도움말(10-30): 상담 어드민에서 고친 내용을 1분 기억한다. 저장 후 1분 안에 반영된다.
// 어드민에 닿지 못하거나(1.5초 안에 답이 없음 포함) 내용이 없으면 기본 문구(지금 copy)와 설정값 문의처를 쓰고,
// 그 결과는 15초만 기억한다. 받는 분 화면도 문의처를 여기서 받으므로, 어드민 장애가 화면을 붙잡거나 매번 다시 부르지 않게 한다
const TTL_MS = 60_000
const FAIL_TTL_MS = 15_000
const TIMEOUT_MS = 1_500
let cached: { at: number; ttl: number; value: HelpContent } | null = null

export function resetHelpCacheForTest() {
  cached = null
}

export async function loadHelpWith(
  settings: { contact_line: string }, fetchRaw: () => Promise<unknown>, now: number, timeoutMs = TIMEOUT_MS,
): Promise<HelpContent> {
  if (cached && now - cached.at < cached.ttl) return cached.value
  let value: HelpContent | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs) })
    value = normalizeHelp(await Promise.race([fetchRaw(), timeout]), settings.contact_line)
  } catch (e) {
    console.error('help load failed', e instanceof Error ? e.message : 'unknown')
  } finally {
    clearTimeout(timer)
  }
  if (value) {
    cached = { at: now, ttl: TTL_MS, value }
    return value
  }
  const fallback = defaultHelp(settings.contact_line)
  cached = { at: now, ttl: FAIL_TTL_MS, value: fallback }
  return fallback
}

export async function loadHelp(): Promise<HelpContent> {
  const s = await getSettings()
  return loadHelpWith(s, () => counsel(s).help(), Date.now())
}
