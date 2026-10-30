// 서랍 도움말 (10-30): 상담 어드민에서 고치는 질문·답(마크다운)·링크 버튼·문의처.
// 검사 규칙과 마크다운 파서는 여기 하나다. 어드민 DB 함수·서랍 서버·서랍 화면·어드민 미리보기가 같은 규칙을 쓴다.
// 마크다운은 정해진 서식(굵게·기울임·목록·링크·문단)만 블록으로 바꾸고, 그 밖의 글(HTML 포함)은 글자 그대로 둔다
import { type CopyKey, t } from './copy.ko.ts'

export type HelpButton = { label: string; url: string }
export type HelpItem = { id: string; question: string; answerMd: string; buttons: HelpButton[] }
export type HelpContent = { items: HelpItem[]; contact: string }
export type HelpProblem = 'question' | 'answer' | 'buttons' | 'buttonLabel' | 'buttonUrl'

export const HELP_LIMITS = { question: 80, answer: 2000, buttonLabel: 20, buttons: 2, contact: 300, url: 500 } as const

const URL_RE = /^(https:\/\/[^\s<>"]+|tel:\+?[0-9-]{3,20})$/
export function isAllowedUrl(u: string): boolean {
  return u.length <= HELP_LIMITS.url && URL_RE.test(u)
}

const len = (s: string) => [...s].length
export function helpItemProblems(i: { question: string; answerMd: string; buttons: HelpButton[] }): HelpProblem[] {
  const out: HelpProblem[] = []
  const q = i.question.trim()
  if (!q || len(q) > HELP_LIMITS.question) out.push('question')
  const a = i.answerMd.trim()
  if (!a || len(a) > HELP_LIMITS.answer) out.push('answer')
  if (i.buttons.length > HELP_LIMITS.buttons) out.push('buttons')
  else if (i.buttons.some((b) => !b.label.trim() || len(b.label.trim()) > HELP_LIMITS.buttonLabel)) out.push('buttonLabel')
  else if (i.buttons.some((b) => !isAllowedUrl(b.url.trim()))) out.push('buttonUrl')
  return out
}

export function contactOk(c: string): boolean {
  return len(c) <= HELP_LIMITS.contact
}

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'em'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] }
  | { kind: 'br' }
export type Block = { kind: 'p'; children: Inline[] } | { kind: 'ul' | 'ol'; items: Inline[][] }

// 링크 → 굵게 → 기울임 순으로 가장 먼저 나오는 것을 고른다. 링크 주소는 공백·괄호 없이 한 덩어리여야 한다
const PATTERNS: { kind: 'link' | 'strong' | 'em'; re: RegExp }[] = [
  { kind: 'link', re: /\[([^\]\n]+)\]\(([^()\s]+)\)/ },
  { kind: 'strong', re: /\*\*([^*\n]+)\*\*/ },
  { kind: 'em', re: /(?<!\*)\*([^*\n]+)\*(?!\*)/ },
]

function pushText(out: Inline[], text: string) {
  if (!text) return
  const last = out[out.length - 1]
  if (last?.kind === 'text') last.text += text
  else out.push({ kind: 'text', text })
}

function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let rest = s
  while (rest) {
    let best: { kind: 'link' | 'strong' | 'em'; m: RegExpExecArray } | null = null
    for (const p of PATTERNS) {
      const m = p.re.exec(rest)
      if (m && (!best || m.index < best.m.index)) best = { kind: p.kind, m }
    }
    if (!best) {
      pushText(out, rest)
      break
    }
    const { kind, m } = best
    pushText(out, rest.slice(0, m.index))
    if (kind === 'link') {
      if (isAllowedUrl(m[2])) out.push({ kind: 'link', href: m[2], children: parseInline(m[1]) })
      else pushText(out, m[0])
    } else {
      out.push({ kind, children: parseInline(m[1]) })
    }
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

// 어드민 에디터(MDXEditor)가 저장하는 표기 (10-30): 기호 앞 역슬래시(\*), 줄 끝 역슬래시 줄바꿈, 숫자 문자 표기(&#x20;).
// 역슬래시로 막은 기호는 잠시 사용자 영역 글자(U+E000 + 코드)로 바꿔 서식으로 읽히지 않게 하고, 다 읽은 뒤 되돌린다
const ESCAPED = /\\([!-/:-@[-`{-~])/g
const HELD = /[\uE000-\uE07F]/g
const ENTITY = /&#x([0-9a-fA-F]{1,6});|&#([0-9]{1,7});/g
const hold = (s: string) => s.replace(/\\$/, '').replace(ESCAPED, (_, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)))
const release = (s: string) => s.replace(HELD, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000))
  .replace(ENTITY, (_, hex?: string, dec?: string) => String.fromCodePoint(hex ? parseInt(hex, 16) : Number(dec)))

function released(nodes: Inline[]): Inline[] {
  return nodes.map((n) => {
    if (n.kind === 'text') return { kind: 'text', text: release(n.text) }
    if (n.kind === 'link') return { kind: 'link', href: release(n.href), children: released(n.children) }
    if (n.kind === 'br') return n
    return { kind: n.kind, children: released(n.children) }
  })
}
const inline = (s: string) => released(parseInline(hold(s)))

function parseLines(lines: string[]): Inline[] {
  const out: Inline[] = []
  lines.forEach((line, i) => {
    if (i > 0) out.push({ kind: 'br' })
    for (const n of inline(line)) {
      if (n.kind === 'text') pushText(out, n.text)
      else out.push(n)
    }
  })
  return out
}

const UL = /^[-*]\s+(.*)$/
const OL = /^\d+\.\s+(.*)$/
export function parseHelpMarkdown(md: string): Block[] {
  const chunks = md.replace(/\r\n?/g, '\n').split(/\n\s*\n/)
    .map((c) => c.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((c) => c.length)
  return chunks.map((lines): Block => {
    if (lines.every((l) => UL.test(l))) return { kind: 'ul', items: lines.map((l) => inline(UL.exec(l)![1])) }
    if (lines.every((l) => OL.test(l))) return { kind: 'ol', items: lines.map((l) => inline(OL.exec(l)![1])) }
    return { kind: 'p', children: parseLines(lines) }
  })
}

const DEFAULT_KEYS = ['noSms', 'lostLink', 'cancel', 'result', 'scam'] as const
export function defaultHelp(contact: string): HelpContent {
  return {
    items: DEFAULT_KEYS.map((k, i) => ({
      id: `default-${i + 1}`, question: t(`help.q.${k}` as CopyKey), answerMd: t(`help.a.${k}` as CopyKey), buttons: [],
    })),
    contact,
  }
}

// 어드민 DB 응답 → 화면 형식. 항목 하나가 규칙을 어기면 그 항목만 뺀다
export function normalizeHelp(raw: unknown, fallbackContact: string): HelpContent | null {
  const r = raw as { items?: unknown; contact_md?: unknown } | null
  if (!r || !Array.isArray(r.items)) return null
  const items: HelpItem[] = []
  for (const x of r.items as Record<string, unknown>[]) {
    if (!x || typeof x.id !== 'string' || typeof x.question !== 'string' || typeof x.answer_md !== 'string' || !Array.isArray(x.buttons)) continue
    const buttons = (x.buttons as Record<string, unknown>[]).map((b) => ({ label: String(b?.label ?? ''), url: String(b?.url ?? '') }))
    const item = { id: x.id, question: x.question.trim(), answerMd: x.answer_md.trim(), buttons }
    if (helpItemProblems(item).length === 0) items.push(item)
  }
  const contact = typeof r.contact_md === 'string' && contactOk(r.contact_md) ? r.contact_md : fallbackContact
  return { items, contact }
}
