import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../../../lib/api'
import { CounselError } from '@counsel-core/errors.ts'
import HelpAdminPage from './HelpAdminPage'

vi.mock('../../../lib/api')
// 에디터(MDXEditor)는 따로 시험한다. 여기서는 같은 값·onChange 를 주고받는 입력 칸으로 바꿔 끼운다
vi.mock('../../../components/MarkdownEditor', () => ({
  default: ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) =>
    <textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />,
}))
vi.mock('../../../shell/session', () => ({ useSession: () => ({ state: { status: 'ready', ctx: { caps: ['help.manage'] } } }), hasCap: () => true }))

const ROWS: api.HelpRow[] = [
  { id: 'a', position: 1, question: '문자가 안 와요', answer_md: '스팸함을 보세요', buttons: [], hidden: false, updated_at: '' },
  { id: 'b', position: 2, question: '숨긴 질문', answer_md: '답', buttons: [], hidden: true, updated_at: '' },
]
beforeEach(() => {
  vi.mocked(api.listHelpItems).mockResolvedValue(ROWS)
  vi.mocked(api.getHelpContact).mockResolvedValue('문의: 톡톡')
  vi.mocked(api.saveHelpItem).mockResolvedValue('a')
  vi.mocked(api.saveHelpContact).mockResolvedValue()
  vi.mocked(api.reorderHelpItems).mockResolvedValue()
  vi.mocked(api.deleteHelpItem).mockResolvedValue()
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks() })
const open = () => render(<MemoryRouter><HelpAdminPage /></MemoryRouter>)

describe('서랍 도움말 관리', () => {
  it('질문 목록과 숨김 표시, 미리보기에는 숨기지 않은 질문만', async () => {
    open()
    const list = await screen.findByRole('list', { name: '질문 목록' })
    expect(within(list).getByText('문자가 안 와요')).toBeTruthy()
    expect(within(list).getByText('숨김')).toBeTruthy()
    const preview = screen.getByRole('region', { name: '서랍 미리보기' })
    expect(within(preview).getByText('문자가 안 와요')).toBeTruthy()
    expect(within(preview).queryByText('숨긴 질문')).toBeNull()
  })
  it('질문을 고르고 답을 고쳐 저장하면 저장 함수를 부르고 미리보기가 바로 바뀐다', async () => {
    open()
    fireEvent.click(within(await screen.findByRole('list', { name: '질문 목록' })).getByText('문자가 안 와요'))
    fireEvent.change(screen.getByLabelText('답'), { target: { value: '**새 답**' } })
    const preview = screen.getByRole('region', { name: '서랍 미리보기' })
    fireEvent.click(within(preview).getByText('문자가 안 와요'))
    expect(within(preview).getByText('새 답').tagName).toBe('STRONG')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(api.saveHelpItem).toHaveBeenCalledWith({ id: 'a', question: '문자가 안 와요', answer_md: '**새 답**', buttons: [], hidden: false }))
  })
  it('규칙 위반이면 저장하지 않고 이유를 보인다', async () => {
    open()
    fireEvent.click(within(await screen.findByRole('list', { name: '질문 목록' })).getByText('문자가 안 와요'))
    fireEvent.click(screen.getByRole('button', { name: '버튼 추가' }))
    fireEvent.change(screen.getByLabelText('버튼 문구'), { target: { value: '열기' } })
    fireEvent.change(screen.getByLabelText('주소 (https:// 또는 tel:)'), { target: { value: 'http://a.com' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('주소는 https:// 또는 tel: 로 시작해야 해요')).toBeTruthy()
    expect(api.saveHelpItem).not.toHaveBeenCalled()
  })
  it('질문마다 끌기 손잡이가 있고, 키보드로 한 칸 내려 놓으면 순서 전체를 저장한다', async () => {
    open()
    const handles = await screen.findAllByRole('button', { name: '끌어서 순서 바꾸기' })
    expect(handles).toHaveLength(2)
    // jsdom 은 크기가 모두 0 이라 끌기 위치를 못 잰다. 목록 줄마다 높이 40px 로 쌓인 것처럼 돌려준다
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const li = this.closest('li')
      const i = li?.parentElement ? [...li.parentElement.children].indexOf(li) : 0
      return { x: 0, y: i * 40, top: i * 40, left: 0, bottom: i * 40 + 40, right: 240, width: 240, height: 40, toJSON: () => ({}) } as DOMRect
    })
    const tick = () => new Promise((r) => setTimeout(r, 20))
    handles[0].focus()
    fireEvent.keyDown(handles[0], { key: ' ', code: 'Space' })
    await tick()
    fireEvent.keyDown(handles[0], { key: 'ArrowDown', code: 'ArrowDown' })
    await tick()
    fireEvent.keyDown(handles[0], { key: ' ', code: 'Space' })
    await waitFor(() => expect(api.reorderHelpItems).toHaveBeenCalledWith(['b', 'a']))
  })
  it('삭제(확인 후), 문의처 저장', async () => {
    open()
    await screen.findAllByRole('button', { name: '끌어서 순서 바꾸기' })
    fireEvent.click(within(screen.getByRole('list', { name: '질문 목록' })).getByText('문자가 안 와요'))
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(api.deleteHelpItem).toHaveBeenCalledWith('a'))
    // 확인 창이 닫히는 동안에는 나머지 화면이 가려져(aria-hidden) 있다
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.change(screen.getByLabelText('문의처'), { target: { value: '[톡톡](https://talk.naver.com/x)' } })
    fireEvent.click(screen.getByRole('button', { name: '문의처 저장' }))
    await waitFor(() => expect(api.saveHelpContact).toHaveBeenCalledWith('[톡톡](https://talk.naver.com/x)'))
  })
  // 최종 검토 ③: 질문을 고르지 않은 상태의 실패(순서 저장·문의처 저장)도 보여야 하고, 목록을 다시 읽는다
  it('질문을 고르지 않은 상태에서 문의처 저장이 실패하면 오류를 보이고 목록을 다시 읽는다', async () => {
    vi.mocked(api.saveHelpContact).mockRejectedValueOnce(new CounselError('FORBIDDEN'))
    open()
    fireEvent.click(await screen.findByRole('button', { name: '문의처 저장' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    await waitFor(() => expect(api.listHelpItems).toHaveBeenCalledTimes(2))
  })
})
