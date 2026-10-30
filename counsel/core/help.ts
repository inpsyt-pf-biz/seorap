// 서랍 도움말 관리 화면의 규칙 (10-30). 화면 없이 시험한다
import { t, type CopyKey } from './copy.ko.ts'

// 끌어 놓은 결과의 순서. 같은 자리에 놓았거나 모르는 id 면 받은 배열을 그대로 돌려준다(바뀐 게 없다는 뜻)
export function reorderIds(ids: string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId)
  const to = ids.indexOf(overId)
  if (from < 0 || to < 0 || from === to) return ids
  const next = [...ids]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

// 에디터(MDXEditor) 도구 막대·링크 창의 한국어. 쓰지 않는 기능의 키는 기본 문구 그대로 둔다
const EDITOR_KEYS: Record<string, CopyKey> = {
  'toolbar.bold': 'help.fmt.bold',
  'toolbar.removeBold': 'help.fmt.bold',
  'toolbar.italic': 'help.fmt.italic',
  'toolbar.removeItalic': 'help.fmt.italic',
  'toolbar.bulletedList': 'help.fmt.ul',
  'toolbar.numberedList': 'help.fmt.ol',
  'toolbar.toggleGroup': 'help.fmt.lists',
  'toolbar.link': 'help.fmt.link',
  'toolbar.undo': 'help.fmt.undo',
  'toolbar.redo': 'help.fmt.redo',
  'createLink.url': 'help.link.url',
  'createLink.urlPlaceholder': 'help.link.urlPlaceholder',
  'createLink.text': 'help.link.text',
  'createLink.textTooltip': 'help.link.text',
  'createLink.saveTooltip': 'help.link.save',
  'createLink.cancelTooltip': 'help.link.cancel',
  'dialogControls.save': 'help.link.save',
  'dialogControls.cancel': 'help.link.cancel',
  'linkPreview.edit': 'help.link.edit',
  'linkPreview.remove': 'help.link.remove',
  'linkPreview.copyToClipboard': 'help.link.copy',
  'linkPreview.copied': 'help.link.copied',
  'contentArea.editableMarkdown': 'help.editor',
}

export function editorText(key: string, defaultValue: string, interpolations: Record<string, unknown> = {}): string {
  const k = EDITOR_KEYS[key]
  if (k) return t(k)
  return defaultValue.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (name in interpolations ? String(interpolations[name]) : whole))
}
