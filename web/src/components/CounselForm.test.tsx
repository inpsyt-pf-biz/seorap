import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { type Answers, type FormDefinition, DEFAULT_AVAILABILITY } from '@core/counselForm.ts'
import { t } from '@core/copy.ko.ts'
import CounselForm from './CounselForm'

afterEach(cleanup)

const DEF: FormDefinition = {
  intro: '아래 문답에 답해 주세요.',
  fields: [
    { id: 'c1', type: 'consent', label: '개인정보 제3자 제공 동의', help: '제공받는 자: 상담센터', required: true, consentKind: 'third_party' },
    { id: 'n1', type: 'notice', label: '제공받는 업체 정보', help: '업체명: 상담센터' },
    { id: 's1', type: 'section', label: '작성 안내' },
    { id: 'name', type: 'short', label: '성함', required: true },
    { id: 'memo', type: 'long', label: '기대하는 점' },
    { id: 'birth', type: 'date', label: '생년월일', required: true },
    { id: 'wed', type: 'single', label: '결혼 예정이신가요?', options: ['결혼 예정입니다.', '아닙니다.'] },
    { id: 'exp', type: 'multi', label: '상담 경험', options: ['있음', '없음'] },
    { id: 'when', type: 'availability', label: '상담 가능한 시간대', required: true, availability: DEFAULT_AVAILABILITY },
  ],
}

let last: Answers = {}
function Harness({ errors }: { errors?: Record<string, 'required'> }) {
  const [v, setV] = useState<Answers>({})
  return <CounselForm definition={DEF} value={v} onChange={(n) => { last = n; setV(n) }} errors={errors} />
}

describe('CounselForm', () => {
  it('모든 유형을 그리고 필수·선택을 표시한다', () => {
    render(<Harness />)
    for (const label of ['개인정보 제3자 제공 동의', '제공받는 업체 정보', '작성 안내', '성함', '기대하는 점', '생년월일', '결혼 예정이신가요?', '상담 경험', '상담 가능한 시간대']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getAllByText(t('form.required')).length).toBe(4)
  })

  it('답을 바꾸면 전체 답을 돌려준다 (동의·단답·객관식·체크박스)', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByLabelText(t('form.agree')))
    await userEvent.type(screen.getByLabelText('성함'), '홍길동')
    await userEvent.click(screen.getByLabelText('아닙니다.'))
    await userEvent.click(screen.getByLabelText('없음'))
    expect(last).toEqual({ c1: true, name: '홍길동', wed: '아닙니다.', exp: ['없음'] })
  })

  it('가능 시간대: 칸을 누르면 켜지고 다시 누르면 꺼진다, 방식은 하나만', async () => {
    render(<Harness />)
    const cell = screen.getByRole('button', { name: '평일 저녁 상담 가능' })
    await userEvent.click(cell)
    await userEvent.click(screen.getByRole('button', { name: '토요일 오전 상담 가능' }))
    expect(cell.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(cell)
    await userEvent.click(screen.getByRole('button', { name: '화상' }))
    await userEvent.click(screen.getByRole('button', { name: '대면' }))
    expect(last.when).toEqual({ cells: ['sat|morning'], method: '대면' })
  })

  it('오류를 문항 아래에 보인다', () => {
    render(<Harness errors={{ name: 'required', when: 'required' }} />)
    expect(screen.getAllByText(t('form.error.required')).length).toBe(2)
  })
})
