import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import MarkdownEditor from './MarkdownEditor'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function setup(value: string) {
  const onChange = vi.fn()
  render(<MarkdownEditor label="답" value={value} onChange={onChange} maxLength={2000} />)
  const box = screen.getByLabelText('답') as HTMLTextAreaElement
  return { onChange, box }
}

describe('마크다운 에디터 서식 단추', () => {
  it('굵게: 고른 글자를 ** 로 감싼다', () => {
    const { onChange, box } = setup('스팸함을 보세요')
    box.setSelectionRange(0, 3)
    fireEvent.click(screen.getByRole('button', { name: '굵게' }))
    expect(onChange).toHaveBeenCalledWith('**스팸함**을 보세요')
  })
  it('글머리 목록: 고른 줄 앞에 - 를 붙인다', () => {
    const { onChange, box } = setup('하나\n둘')
    box.setSelectionRange(0, 4)
    fireEvent.click(screen.getByRole('button', { name: '글머리 목록' }))
    expect(onChange).toHaveBeenCalledWith('- 하나\n- 둘')
  })
  it('링크: 주소를 물어 [글자](주소)로 넣고, 허용하지 않는 주소면 넣지 않는다', () => {
    const { onChange, box } = setup('톡톡 문의')
    box.setSelectionRange(0, 2)
    vi.spyOn(window, 'prompt').mockReturnValueOnce('https://talk.naver.com/x')
    fireEvent.click(screen.getByRole('button', { name: '링크' }))
    expect(onChange).toHaveBeenLastCalledWith('[톡톡](https://talk.naver.com/x) 문의')
    onChange.mockClear()
    vi.spyOn(window, 'prompt').mockReturnValueOnce('javascript:alert(1)')
    fireEvent.click(screen.getByRole('button', { name: '링크' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
