import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import MarkdownEditor from './MarkdownEditor'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const tool = (name: string) => document.querySelector(`[title="${name}"], [aria-label="${name}"]`)

describe('도움말 에디터 (MDXEditor)', () => {
  it('마크다운을 서식이 보이는 채로 띄운다', async () => {
    render(<MarkdownEditor label="답" value={'**스팸함**을 보세요\n\n- 하나'} onChange={() => {}} maxLength={2000} />)
    await waitFor(() => expect(document.querySelector('[contenteditable] strong')?.textContent).toBe('스팸함'))
    expect(document.querySelector('[contenteditable] li')?.textContent).toBe('하나')
  })
  it('도구 막대는 굵게·기울임·목록 두 가지·링크만, 한국어 이름', async () => {
    render(<MarkdownEditor label="답" value="" onChange={() => {}} maxLength={2000} />)
    await waitFor(() => expect(tool('굵게')).toBeTruthy())
    for (const n of ['기울임', '글머리 목록', '번호 목록', '링크']) expect(tool(n)).toBeTruthy()
    for (const n of ['Underline', 'Check list', 'Insert table', 'Insert image', 'Insert Code Block']) expect(tool(n)).toBeNull()
  })
  it('이름표와 글자 수, 넘치면 오류 문구 색', async () => {
    render(<MarkdownEditor label="답" value="가나다" onChange={() => {}} maxLength={2} />)
    expect(screen.getByText('답')).toBeTruthy()
    expect(screen.getByText('3 / 2').className).toMatch(/Mui-error/)
  })
})
