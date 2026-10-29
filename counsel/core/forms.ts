// 신청서 템플릿 편집 규칙 (서랍 B2). 문항 정의와 검사의 정본은 서랍 _shared/core/counselForm.ts 이고,
// 여기에는 편집 화면이 쓰는 이름표·새 문항 만들기·순서 바꾸기만 둔다.
import {
  DEFAULT_AVAILABILITY, STANDARD_FIELDS, type FieldType, type FormDefinition, type FormField, type StandardField,
} from '../../supabase/functions/_shared/core/counselForm.ts'
import { t, type CopyKey } from './copy.ko.ts'
import { errorText, type CounselError } from './errors.ts'
import type { PurchaseType } from './purchases.ts'

export type FormTemplateRow = {
  id: string; name: string; published_version: number | null; version: number; updated_at: string; link_count: number
}
export type FormTemplateDetail = { id: string; name: string; draft: FormDefinition; published_version: number | null; version: number }
export type FormLink = {
  manage_code: string; template_id: string; purchase_type: PurchaseType; flow: 'counsel_first'; enabled: boolean; label: string | null
}

export const FIELD_TYPES: FieldType[] = ['short', 'long', 'single', 'multi', 'date', 'availability', 'consent', 'notice', 'section']
export const fieldTypeLabel = (ft: FieldType) => `forms.type.${ft}` as CopyKey
export const standardFieldLabel = (s: StandardField) => `forms.std.${s}` as CopyKey
export { STANDARD_FIELDS }

export const MANAGE_CODE_RE = /^[A-Za-z0-9_-]{1,20}$/

// 템플릿 화면의 오류 문장. 이름이 겹치면 센터 문장("같은 이름의 센터") 대신 템플릿 문장으로
export function formErrorText(e: CounselError): string {
  return e.code === 'DUPLICATE_NAME' ? t('forms.duplicateName') : errorText(e)
}

export function emptyDefinition(): FormDefinition {
  return { intro: '', fields: [] }
}

// 같은 템플릿 안에서 겹치지 않는 id (f1, f2, ...). 판이 바뀌어도 기존 문항 id 는 그대로 둔다
export function nextFieldId(fields: FormField[]): string {
  const used = new Set(fields.map((f) => f.id))
  for (let n = fields.length + 1; ; n++) if (!used.has(`f${n}`)) return `f${n}`
}

export function newField(type: FieldType, fields: FormField[]): FormField {
  const base: FormField = { id: nextFieldId(fields), type, label: '' }
  if (type === 'single' || type === 'multi') return { ...base, options: ['', ''] }
  if (type === 'availability') return { ...base, required: true, availability: structuredClone(DEFAULT_AVAILABILITY) }
  if (type === 'consent') return { ...base, required: true, consentKind: 'third_party' }
  return base
}

export function moveField(fields: FormField[], index: number, delta: -1 | 1): FormField[] {
  const to = index + delta
  if (to < 0 || to >= fields.length) return fields
  const next = [...fields]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

// 게시 직전 정리: 빈 선택지를 빼고 앞뒤 공백을 지운다
export function tidyDefinition(def: FormDefinition): FormDefinition {
  return {
    intro: def.intro.trim(),
    fields: def.fields.map((f) => ({
      ...f,
      label: f.label.trim(),
      ...(f.help !== undefined ? { help: f.help.trim() || undefined } : {}),
      ...(f.options ? { options: f.options.map((o) => o.trim()).filter(Boolean) } : {}),
    })),
  }
}
