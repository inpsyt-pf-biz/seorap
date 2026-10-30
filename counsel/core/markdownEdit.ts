// 도움말 에디터의 서식 단추 (10-30). 마크다운 글과 고른 범위를 받아 새 글과 새 범위를 돌려준다(화면 없이 시험한다)
export type Edit = { text: string; selStart: number; selEnd: number }

export function wrapSelection(text: string, start: number, end: number, mark: '**' | '*'): Edit {
  const picked = text.slice(start, end)
  return { text: text.slice(0, start) + mark + picked + mark + text.slice(end), selStart: start + mark.length, selEnd: end + mark.length }
}

export function prefixLines(text: string, start: number, end: number, kind: 'ul' | 'ol'): Edit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const nl = text.indexOf('\n', Math.max(end - 1, start))
  const lineEnd = nl === -1 ? text.length : nl
  const lines = text.slice(lineStart, lineEnd).split('\n')
  const body = lines.map((l, i) => (kind === 'ul' ? `- ${l}` : `${i + 1}. ${l}`)).join('\n')
  return { text: text.slice(0, lineStart) + body + text.slice(lineEnd), selStart: lineStart, selEnd: lineStart + body.length }
}

export function insertLink(text: string, start: number, end: number, url: string): Edit {
  const label = text.slice(start, end) || '링크'
  const link = `[${label}](${url})`
  return { text: text.slice(0, start) + link + text.slice(end), selStart: start, selEnd: start + link.length }
}
