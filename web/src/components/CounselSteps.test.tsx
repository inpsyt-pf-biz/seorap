import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@core/copy.ko.ts'
import type { Answers, FormDefinition } from '@core/counselForm.ts'
import CounselSteps from './CounselSteps'

afterEach(cleanup)

// 11-10 상담메인 새 판의 모양을 줄인 정의
const DEF: FormDefinition = {
  intro: '안내',
  fields: [
    { id: 'c1', type: 'consent', label: '개인정보 제3자 제공 동의', required: true, consentKind: 'third_party', help: '제공받는 자: 상담센터' },
    { id: 'c3', type: 'consent', label: '취소 및 환불 규정 확인', required: true, consentKind: 'refund' },
    { id: 'birth', type: 'date', label: '생년월일', required: true },
    { id: 'topics', type: 'multi', label: '이야기하고 싶은 주제를 골라 주세요', options: ['소통', '대인관계 (예: 여사친·남사친)'], other: true },
    { id: 'span', type: 'single', label: '{{topics}}에 대해 갈등이 있었다면, 지속된 기간을 알려 주세요', required: true, options: ['최근 3개월 이내', '1년~3년'], showIf: { field: 'topics' } },
    { id: 'c2', type: 'consent', label: '민감정보 수집·이용 동의(선택)', consentKind: 'sensitive' },
    { id: 'drug', type: 'long', label: '복용 중인 약이나 진단받은 질환이 있나요?', sensitive: true },
    { id: 'exp', type: 'single', label: '심리상담을 받아 본 적 있나요?', options: ['있어요', '없어요'] },
  ],
}

function Harness({ onSubmit }: { onSubmit: (a: Answers) => void }) {
  const [v, setV] = useState<Answers>({})
  return <CounselSteps definition={DEF} value={v} onChange={setV} onSubmit={onSubmit} />
}
const heading = () => screen.getByRole('heading', { level: 2 }).textContent

const toTopics = async () => {
  await userEvent.click(await screen.findByRole('button', { name: t('steps.agreeAll') }))
  await userEvent.type(await screen.findByLabelText('생년월일'), '19950312')
  await screen.findByRole('heading', { name: '이야기하고 싶은 주제를 골라 주세요' })
}

describe('상담 신청서 단계형 화면', () => {
  it('시작 화면에서 필수 동의를 한 번에 받고, 하나씩 고르다 필수가 빠지면 알린다', async () => {
    render(<Harness onSubmit={vi.fn()} />)
    expect(heading()).toBe(t('steps.start.title'))
    await userEvent.click(screen.getByRole('checkbox', { name: '취소 및 환불 규정 확인' }))
    await userEvent.click(screen.getByRole('button', { name: t('steps.begin') }))
    expect(screen.getByText(t('steps.consentNeeded'))).toBeTruthy()
    await userEvent.click(screen.getByRole('checkbox', { name: '개인정보 제3자 제공 동의' }))
    await userEvent.click(screen.getByRole('button', { name: t('steps.agreeAll') }))
    expect(await screen.findByLabelText('생년월일')).toBeTruthy()
  })

  it('생년월일은 8자리를 다 쓰면 넘어가고, 없는 날짜면 멈춰서 알린다', async () => {
    render(<Harness onSubmit={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: t('steps.agreeAll') }))
    await userEvent.type(await screen.findByLabelText('생년월일'), '19951332')
    expect(screen.getByText(t('form.error.format'))).toBeTruthy()
    await userEvent.clear(screen.getByLabelText('생년월일'))
    await userEvent.type(screen.getByLabelText('생년월일'), '19950312')
    expect(await screen.findByRole('heading', { name: '이야기하고 싶은 주제를 골라 주세요' })).toBeTruthy()
  })

  it('기타는 누르면 그 자리가 입력 칸이 되고, 고른 주제가 다음 질문 제목에 들어간다', async () => {
    render(<Harness onSubmit={vi.fn()} />)
    await toTopics()
    await userEvent.click(screen.getByRole('button', { name: '소통' }))
    await userEvent.click(screen.getByRole('button', { name: '대인관계 (예: 여사친·남사친)' }))
    const other = screen.getByRole('textbox', { name: t('form.other') }) as HTMLInputElement
    expect(other.placeholder).toBe(t('form.other'))
    await userEvent.click(other)
    expect(document.activeElement).toBe(other)
    expect(other.placeholder).toBe(t('form.otherPlaceholder'))
    await userEvent.type(other, '육아{Enter}')
    expect(await screen.findByRole('heading', { name: '소통, 대인관계, 육아에 대해 갈등이 있었다면, 지속된 기간을 알려 주세요' })).toBeTruthy()
  })

  it('주제를 고르지 않고 넘기면 기간 질문도 건너뛴다', async () => {
    render(<Harness onSubmit={vi.fn()} />)
    await toTopics()
    await userEvent.click(screen.getByRole('button', { name: t('steps.skip') }))
    // 다음은 민감정보 동의 화면: 제목은 그 뒤 질문
    expect(await screen.findByRole('heading', { name: '복용 중인 약이나 진단받은 질환이 있나요?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('steps.sensitive.agree') })).toBeTruthy()
  })

  it('민감정보 동의를 하지 않으면 그 질문을 건너뛰고, 내는 답에는 숨은 답이 없다', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    await toTopics()
    await userEvent.click(screen.getByRole('button', { name: '소통' }))
    await userEvent.click(screen.getByRole('button', { name: t('steps.next') }))
    await userEvent.click(await screen.findByRole('button', { name: '1년~3년' }))
    await userEvent.click(await screen.findByRole('button', { name: t('steps.sensitive.skip') }))
    await userEvent.click(await screen.findByRole('button', { name: '없어요' }))
    // 확인 화면에서 주제를 지우러 돌아갔다가 오면, 숨은 기간 답은 빠진다
    await screen.findByText(t('steps.review.title'))
    await userEvent.click(screen.getByRole('button', { name: /이야기하고 싶은 주제/ }))
    await userEvent.click(await screen.findByRole('button', { name: '소통' }))
    await userEvent.click(screen.getByRole('button', { name: t('steps.skip') }))
    await screen.findByText(t('steps.review.title'))
    await userEvent.click(screen.getByRole('button', { name: t('steps.submit') }))
    expect(onSubmit).toHaveBeenCalledWith({ c1: true, c3: true, birth: '1995-03-12', topics: [], c2: false, exp: '없어요' })
  })

  it('확인 화면에서 줄을 누르면 그 질문으로 가고, 답하면 확인 화면으로 돌아온다', async () => {
    render(<Harness onSubmit={vi.fn()} />)
    await toTopics()
    await userEvent.click(screen.getByRole('button', { name: t('steps.skip') }))
    await userEvent.click(await screen.findByRole('button', { name: t('steps.sensitive.skip') }))
    await userEvent.click(await screen.findByRole('button', { name: '있어요' }))
    await screen.findByText(t('steps.review.title'))
    await userEvent.click(screen.getByRole('button', { name: /심리상담을 받아 본 적/ }))
    await userEvent.click(await screen.findByRole('button', { name: '없어요' }))
    expect(await screen.findByText(t('steps.review.title'))).toBeTruthy()
    expect(screen.getByRole('button', { name: /심리상담을 받아 본 적/ }).textContent).toContain('없어요')
  })

  it('이전 질문 버튼으로 한 단계씩 돌아간다', async () => {
    render(<Harness onSubmit={vi.fn()} />)
    await toTopics()
    await userEvent.click(screen.getByRole('button', { name: t('steps.back') }))
    expect((await screen.findByLabelText('생년월일') as HTMLInputElement).value).toBe('19950312')
  })
})
