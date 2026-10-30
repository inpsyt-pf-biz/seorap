import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@core/copy.ko.ts'
import NicknamePage from './NicknamePage'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

function open(profile: { nickname: string | null; defaultName: string }) {
  const posts: any[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/profile')) return json(200, profile)
    posts.push(JSON.parse(String(init?.body)))
    return json(200, { ok: true })
  }))
  render(
    <MemoryRouter initialEntries={['/box/settings/nickname']}>
      <Routes>
        <Route path="/box/settings" element={<div>설정 화면</div>} />
        <Route path="/box/settings/nickname" element={<NicknamePage />} />
      </Routes>
    </MemoryRouter>,
  )
  return posts
}

describe('NicknamePage (닉네임 설정)', () => {
  it('지금 닉네임을 채워 보여 주고, 비워 두면 어떤 이름으로 보이는지 알린다', async () => {
    open({ nickname: '엄마', defaultName: '홍*동' })
    expect(((await screen.findByLabelText(t('nickname.label'))) as HTMLInputElement).value).toBe('엄마')
    expect(screen.getByText(t('nickname.help', { name: '홍*동' }))).toBeTruthy()
  })
  it('저장하면 서버에 보내고 설정으로 돌아간다', async () => {
    const posts = open({ nickname: null, defaultName: '홍*동' })
    await userEvent.type(await screen.findByLabelText(t('nickname.label')), '아빠')
    await userEvent.click(screen.getByRole('button', { name: t('nickname.save') }))
    expect(await screen.findByText('설정 화면')).toBeTruthy()
    expect(posts).toEqual([{ nickname: '아빠' }])
  })
  it('비워서 저장하면 닉네임을 지운다(가린 실명으로 돌아감)', async () => {
    const posts = open({ nickname: '엄마', defaultName: '홍*동' })
    await userEvent.clear(await screen.findByLabelText(t('nickname.label')))
    await userEvent.click(screen.getByRole('button', { name: t('nickname.save') }))
    expect(await screen.findByText('설정 화면')).toBeTruthy()
    expect(posts).toEqual([{ nickname: null }])
  })
  it('쓸 수 없는 글자면 서버를 부르지 않고 알린다', async () => {
    const posts = open({ nickname: null, defaultName: '홍*동' })
    await userEvent.type(await screen.findByLabelText(t('nickname.label')), '엄마!')
    await userEvent.click(screen.getByRole('button', { name: t('nickname.save') }))
    expect(await screen.findByText(t('nickname.error'))).toBeTruthy()
    expect(posts).toEqual([])
  })
})
