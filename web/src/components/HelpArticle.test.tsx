import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import HelpArticle from './HelpArticle'

afterEach(cleanup)
const content = {
  items: [{
    id: 'a', question: '문자가 안 와요',
    answerMd: '**스팸함**을 보세요\n\n- 하나\n- 둘\n\n[톡톡](https://talk.naver.com/x) <script>x</script> [나쁜](javascript:alert(1))',
    buttons: [{ label: '톡톡으로 문의하기', url: 'https://talk.naver.com/x' }],
  }],
  contact: '문의: [전화](tel:1588-0000)',
}

describe('HelpArticle', () => {
  it('답의 서식·목록·링크를 그리고, HTML·위험 주소는 글자 그대로 둔다', async () => {
    render(<HelpArticle content={content} />)
    await userEvent.click(screen.getByText('문자가 안 와요'))
    expect(screen.getByText('스팸함').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['하나', '둘'])
    const link = screen.getByRole('link', { name: '톡톡' })
    expect(link.getAttribute('href')).toBe('https://talk.naver.com/x')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText(/<script>x<\/script>/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: '나쁜' })).toBeNull()
  })
  it('링크 버튼은 새 창으로 연다', async () => {
    render(<HelpArticle content={content} />)
    await userEvent.click(screen.getByText('문자가 안 와요'))
    const btn = screen.getByRole('link', { name: '톡톡으로 문의하기' })
    expect(btn.getAttribute('href')).toBe('https://talk.naver.com/x')
    expect(btn.getAttribute('target')).toBe('_blank')
  })
  it('문의처도 마크다운으로 그린다', () => {
    render(<HelpArticle content={content} />)
    expect(screen.getByRole('link', { name: '전화' }).getAttribute('href')).toBe('tel:1588-0000')
  })
  it('질문이 0개면 문의처만 보인다', () => {
    render(<HelpArticle content={{ items: [], contact: '문의처' }} />)
    expect(screen.getByText('문의처')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toEqual([])
  })
  // 최종 검토 ①: 버튼 주소도 화면에서 한 번 더 거른다(설계: 세 곳에서 막는다). 어드민 미리보기의 초안 주소도 같다
  it('허용하지 않는 주소의 버튼은 그리지 않는다', async () => {
    render(<HelpArticle content={{ items: [{ id: 'b', question: '질문', answerMd: '답', buttons: [
      { label: '나쁜 버튼', url: 'javascript:alert(1)' }, { label: '좋은 버튼', url: 'https://a.com' },
    ] }], contact: '' }} />)
    await userEvent.click(screen.getByText('질문'))
    expect(screen.queryByText('나쁜 버튼')).toBeNull()
    expect(screen.getByRole('link', { name: '좋은 버튼' })).toBeTruthy()
  })
})
