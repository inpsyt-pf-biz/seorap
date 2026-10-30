import { defaultHelp, type HelpContent, normalizeHelp } from '../../_shared/core/helpContent.ts'
import { counsel } from './counsel.ts'
import { getSettings } from './settings.ts'

// 도움말(10-30): 상담 어드민에서 고친 내용을 1분 기억한다. 저장 후 1분 안에 반영된다.
// 어드민에 닿지 못하거나 내용이 없으면 기본 문구(지금 copy)와 설정값 문의처를 쓰고, 그 결과는 기억하지 않는다
const TTL_MS = 60_000
let cached: { at: number; value: HelpContent } | null = null

export function resetHelpCacheForTest() {
  cached = null
}

export async function loadHelpWith(settings: { contact_line: string }, fetchRaw: () => Promise<unknown>, now: number): Promise<HelpContent> {
  if (cached && now - cached.at < TTL_MS) return cached.value
  try {
    const value = normalizeHelp(await fetchRaw(), settings.contact_line)
    if (value) {
      cached = { at: now, value }
      return value
    }
  } catch (e) {
    console.error('help load failed', e instanceof Error ? e.message : 'unknown')
  }
  return defaultHelp(settings.contact_line)
}

export async function loadHelp(): Promise<HelpContent> {
  const s = await getSettings()
  return loadHelpWith(s, () => counsel(s).help(), Date.now())
}
