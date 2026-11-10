import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FormField } from '@seorap-core/counselForm.ts'
import { t } from '@counsel-core/copy.ko.ts'
import FieldLogic from './FieldLogic'

afterEach(cleanup)

const TOPICS: FormField = { id: 'topics', type: 'multi', label: '이야기하고 싶은 주제', options: ['소통', '가치관'] }
const SPAN: FormField = { id: 'span', type: 'single', label: '지속된 기간', options: ['1년~3년'] }

describe('문항 편집: 기타·보이는 조건·앞 질문의 답 넣기 (11-10)', () => {
  it('선택형에만 기타(직접 입력) 스위치가 있다', async () => {
    const onChange = vi.fn()
    render(<FieldLogic f={SPAN} earlier={[TOPICS]} readOnly={false} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText(t('forms.edit.other')))
    expect(onChange).toHaveBeenCalledWith({ other: true })
    cleanup()
    render(<FieldLogic f={{ id: 'n', type: 'short', label: '이름' }} earlier={[]} readOnly={false} onChange={vi.fn()} />)
    expect(screen.queryByLabelText(t('forms.edit.other'))).toBeNull()
  })

  it('보이는 조건: 앞 문항을 고르고, 선택형이면 특정 답일 때만으로 좁힌다', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<FieldLogic f={SPAN} earlier={[TOPICS]} readOnly={false} onChange={onChange} />)
    fireEvent.mouseDown(screen.getByLabelText(t('forms.edit.showIf')))
    fireEvent.click(within(screen.getByRole('listbox')).getByText(t('forms.edit.showIf.answered', { label: '이야기하고 싶은 주제' })))
    expect(onChange).toHaveBeenLastCalledWith({ showIf: { field: 'topics' } })
    rerender(<FieldLogic f={{ ...SPAN, showIf: { field: 'topics' } }} earlier={[TOPICS]} readOnly={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '가치관' }))
    expect(onChange).toHaveBeenLastCalledWith({ showIf: { field: 'topics', anyOf: ['가치관'] } })
  })

  it('앞 질문의 답 넣기: 질문 끝에 {{문항id}}를 붙인다', async () => {
    const onChange = vi.fn()
    render(<FieldLogic f={{ ...SPAN, label: '갈등 기간: ' }} earlier={[TOPICS]} readOnly={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: t('forms.edit.insert') }))
    fireEvent.click(screen.getByRole('menuitem', { name: '이야기하고 싶은 주제' }))
    expect(onChange).toHaveBeenCalledWith({ label: '갈등 기간: {{topics}}' })
  })

  it('앞 문항이 없으면 조건·끼워 넣기를 보이지 않는다', () => {
    render(<FieldLogic f={SPAN} earlier={[]} readOnly={false} onChange={vi.fn()} />)
    expect(screen.queryByLabelText(t('forms.edit.showIf'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('forms.edit.insert') })).toBeNull()
  })
})
