import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoxLine, BoxResponse } from '@core/apiTypes.ts'
import BoxPage from './BoxPage'
import Placeholder from './Placeholder'

// vitest 에 globals 가 없어 RTL 의 자동 정리가 꺼져 있다. 테스트마다 직접 비우고, 가짜 fetch·location 도 되돌린다.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

const launchable: BoxLine = {
  voucherId: 'v1', testItemId: 'T', testName: 'STS 성인 기질검사', unitNo: 1, unitsOfTest: 1, firstLaunchedAt: null, forwardTo: null,
  status: { label: '실시 전', tone: 'neutral', actions: ['launch', 'forward'] },
}
const forwarded: BoxLine = {
  ...launchable, voucherId: 'v2',
  forwardTo: { name: '홍길동', phone: '010-1234-5678' },
  status: { label: '전달함 · 홍길동', tone: 'info', actions: ['resend', 'reforward'] },
}
const boxOf = (lines: BoxLine[]): BoxResponse => ({
  ownerName: '김서랍', notStartedCount: lines.length, noticeBanner: null,
  groups: [{ orderId: 'o1', purchasedAt: '2026-10-01T00:00:00.000Z', productName: 'STS', lineCount: lines.length, done: false, lines }],
})

// 경로별로 응답을 정하는 가짜 fetch. 서랍 조회는 항상 같은 서랍을 돌려준다.
function stubApi(lines: BoxLine[], routes: Record<string, () => Promise<Response>>) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = url.replace(/^\/api\//, '')
    calls.push(path)
    if (path === 'box') return json(200, boxOf(lines))
    const route = routes[path]
    if (!route) throw new Error(`unexpected call: ${path}`)
    return route()
  }))
  return calls
}
const count = (calls: string[], path: string) => calls.filter((c) => c === path).length

function open() {
  render(<MemoryRouter><BoxPage /></MemoryRouter>)
}

describe('BoxPage 처리 중 잠금', () => {
  it('실시하기 연타는 한 번만 부르고, 성공한 뒤에는 이동 중이라 계속 잠근다', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    let release: (r: Response) => void = () => {}
    const calls = stubApi([launchable], {
      'voucher/launch': () => new Promise<Response>((resolve) => { release = resolve }),
    })
    open()
    const launch = await screen.findByRole('button', { name: '실시하기' })
    // 화면이 다시 그려지기 전에 두 번째 탭이 들어오는 연타를 한 번의 act 안에서 흉내 낸다
    act(() => { launch.click(); launch.click() })
    expect(count(calls, 'voucher/launch')).toBe(1)
    await act(async () => { release(json(200, { url: 'https://exam.test/start' })) })
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://exam.test/start'))
    await userEvent.click(screen.getByRole('button', { name: '실시하기' }))
    expect(count(calls, 'voucher/launch')).toBe(1)
  })

  it('실패하면 잠금이 풀려 다시 누를 수 있다', async () => {
    const calls = stubApi([launchable], {
      'voucher/launch': async () => json(500, { error: { code: 'UPSTREAM_FAILED' } }),
    })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '실시하기' }))
    expect(await screen.findByText('잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '실시하기' }))
    await waitFor(() => expect(count(calls, 'voucher/launch')).toBe(2))
  })

  it('다시 보내기 확인을 연타해도 한 번만 보낸다', async () => {
    const calls = stubApi([forwarded], {
      'forward/resend': async () => json(200, { forwardId: 'f1', created: true }),
    })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '다시 보내기' }))
    const confirm = await screen.findByRole('button', { name: '보내기' })
    act(() => { confirm.click(); confirm.click() })
    await waitFor(() => expect(count(calls, 'forward/resend')).toBe(1))
  })
})

describe('BoxPage 다시 보내기 결과 안내', () => {
  it('성공하면 받는 분 이름과 함께 성공 안내를 보인다', async () => {
    stubApi([forwarded], { 'forward/resend': async () => json(200, { forwardId: 'f1', created: true }) })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '다시 보내기' }))
    await userEvent.click(await screen.findByRole('button', { name: '보내기' }))
    const text = await screen.findByText('홍길동님께 보냈어요')
    expect(text.closest('[role="alert"]')?.className).toContain('MuiAlert-colorSuccess')
  })

  it('실패하면 경고 안내를 보이고 성공 안내는 없다', async () => {
    stubApi([forwarded], { 'forward/resend': async () => json(500, { error: { code: 'UPSTREAM_FAILED' } }) })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '다시 보내기' }))
    await userEvent.click(await screen.findByRole('button', { name: '보내기' }))
    const text = await screen.findByText('잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요')
    expect(text.closest('[role="alert"]')?.className).toContain('MuiAlert-colorWarning')
    expect(screen.queryByText('홍길동님께 보냈어요')).toBeNull()
  })
})

describe('BoxPage 전달 시트 결과', () => {
  it('전달에 성공하면 시트를 닫고 서랍을 새로 불러온 뒤 성공 안내를 보인다', async () => {
    const calls = stubApi([launchable], { 'forward/create': async () => json(200, { forwardId: 'f1', created: true }) })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '전달하기' }))
    await userEvent.type(screen.getByLabelText('이름 또는 호칭'), '홍길동')
    await userEvent.type(screen.getByLabelText('휴대폰 번호'), '01012345678')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    const text = await screen.findByText('홍길동님께 보냈어요')
    expect(text.closest('[role="alert"]')?.className).toContain('MuiAlert-colorSuccess')
    expect(screen.queryByLabelText('이름 또는 호칭')).toBeNull() // 시트는 닫혔다
    expect(count(calls, 'box')).toBe(2) // 처음 한 번 + 전달 뒤 새로고침
  })
})

const GENERIC = '잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요'
const EXPIRED = '다시 인증해 주세요. 받은 알림톡의 링크를 다시 눌러 주세요'

describe('BoxPage 세션 끝 판단', () => {
  it('세션 코드가 아닌 401(게이트웨이 등)은 다시 인증 화면이 아니라 오류 화면', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { msg: 'Invalid JWT' })))
    open()
    expect(await screen.findByText(GENERIC)).toBeTruthy()
    expect(screen.queryByText(EXPIRED)).toBeNull()
  })

  it('SESSION_EXPIRED 면 다시 인증 화면', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: { code: 'SESSION_EXPIRED' } })))
    open()
    expect(await screen.findByText(EXPIRED)).toBeTruthy()
  })
})

describe('BoxPage 코드 보기', () => {
  it('코드 창에는 닫기 버튼이 하나뿐이다', async () => {
    stubApi([launchable], { 'voucher/code': async () => json(200, { code: 'TEST-0001-0001' }) })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '코드 보기' }))
    expect(await screen.findByText(/TEST-0001-0001/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '닫기' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(screen.queryByText(/TEST-0001-0001/)).toBeNull())
  })
})

describe('BoxPage 로그아웃', () => {
  it('로그아웃하면 로그아웃했다는 안내 화면으로 간다', async () => {
    stubApi([launchable], { logout: async () => json(200, { ok: true }) })
    render(
      <MemoryRouter initialEntries={['/box']}>
        <Routes>
          <Route path="/" element={<Placeholder />} />
          <Route path="/box" element={<BoxPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: '로그아웃' }))
    expect(await screen.findByText('로그아웃했어요. 받은 알림톡의 링크로 다시 들어올 수 있어요.')).toBeTruthy()
    expect(screen.queryByText('서비스를 준비하고 있어요.')).toBeNull()
  })

  it('그냥 첫 화면으로 오면 준비 중 안내 그대로', () => {
    render(<MemoryRouter initialEntries={['/']}><Placeholder /></MemoryRouter>)
    expect(screen.getByText('서비스를 준비하고 있어요.')).toBeTruthy()
  })
})

// 묶음 펼침: 처음 볼 때만 done 으로 정하고, 서랍을 다시 불러와도(동작 뒤·탭을 오간 뒤) 사용자가 보던 상태를 바꾸지 않는다.
// 펼침 기억은 화면을 다시 열어도 이어지므로, 시험마다 다른 주문 ID 를 쓴다.
describe('BoxPage 묶음 펼침', () => {
  const groupOf = (orderId: string, done: boolean, lines: BoxLine[]): BoxResponse => ({
    ownerName: '김서랍', notStartedCount: 0, noticeBanner: null,
    groups: [{ orderId, purchasedAt: '2026-10-01T00:00:00.000Z', productName: 'STS', lineCount: lines.length, done, lines }],
  })
  const sent: BoxLine = { ...forwarded, voucherId: 'v1', status: { ...forwarded.status, actions: ['resend', 'reforward'] } }
  // 첫 조회는 할 일이 남은 묶음, 그 뒤 조회는 방금 전달해 끝난(done) 묶음
  function stubSequence(orderId: string) {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = url.replace(/^\/api\//, '')
      if (path === 'box') return json(200, n++ === 0 ? groupOf(orderId, false, [launchable]) : groupOf(orderId, true, [sent]))
      if (path === 'forward/create') return json(200, { forwardId: 'f1', created: true })
      throw new Error(`unexpected call: ${path}`)
    }))
  }
  const summary = () => screen.getByRole('button', { name: /2026-10-01 구매/ })
  async function forwardFirstLine() {
    await userEvent.click(await screen.findByRole('button', { name: '전달하기' }))
    await userEvent.type(screen.getByLabelText('이름 또는 호칭'), '홍길동')
    await userEvent.type(screen.getByLabelText('휴대폰 번호'), '01012345678')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    await screen.findByText('홍길동님께 보냈어요')
  }

  it('처음 볼 때 끝난 묶음은 접혀 있고, 눌러서 펼 수 있다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, groupOf('o-done', true, [sent]))))
    open()
    await screen.findByText('전달함 · 홍길동')
    expect(summary().getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(summary())
    expect(summary().getAttribute('aria-expanded')).toBe('true')
  })

  it('동작으로 묶음이 끝나도(done) 다시 불러온 뒤 펼친 채로 두고, MUI 경고도 없다', async () => {
    const errors = vi.spyOn(console, 'error')
    stubSequence('o-same')
    open()
    await screen.findByRole('button', { name: '실시하기' })
    expect(summary().getAttribute('aria-expanded')).toBe('true')
    await forwardFirstLine()
    expect(await screen.findByText('전달함 · 홍길동')).toBeTruthy()
    expect(summary().getAttribute('aria-expanded')).toBe('true')
    expect(errors.mock.calls.some((c) => String(c[0]).includes('uncontrolled'))).toBe(false)
  })

  it('전달 이력 탭에 갔다 돌아와도 방금 동작한 묶음은 펼쳐져 있다', async () => {
    stubSequence('o-tab')
    render(
      <MemoryRouter initialEntries={['/box']}>
        <Routes>
          <Route path="/box" element={<BoxPage />} />
          <Route path="/box/history" element={<Link to="/box">back</Link>} />
        </Routes>
      </MemoryRouter>,
    )
    await forwardFirstLine()
    await userEvent.click(screen.getByRole('tab', { name: '전달 이력' }))
    await userEvent.click(await screen.findByRole('link', { name: 'back' }))
    expect(await screen.findByText('전달함 · 홍길동')).toBeTruthy()
    expect(summary().getAttribute('aria-expanded')).toBe('true')
  })
})

describe('BoxPage 다른 분께 확인 문구', () => {
  it('링크로 전달한 줄은 받는 분 이름 없이 묻는다', async () => {
    const direct: BoxLine = {
      ...launchable, voucherId: 'v3', forwardTo: null,
      status: { label: '링크로 전달함', tone: 'info', actions: ['reforward'] },
    }
    stubApi([direct], {})
    open()
    await userEvent.click(await screen.findByRole('button', { name: '다른 분께' }))
    expect(await screen.findByText('복사해 둔 링크는 더 이상 열리지 않아요. 다른 분께 보낼까요?')).toBeTruthy()
    expect(screen.queryByText(/^님께/)).toBeNull()
  })

  it('이름·번호로 보낸 줄은 받는 분 이름을 넣어 묻는다', async () => {
    stubApi([forwarded], {})
    open()
    await userEvent.click(await screen.findByRole('button', { name: '다른 분께' }))
    expect(await screen.findByText('홍길동님께 보낸 링크는 더 이상 열리지 않아요. 다른 분께 보낼까요?')).toBeTruthy()
  })
})

// 이어서 하기는 응시 중일 때만, 실시한 줄은 [결과 보기]. 두 버튼은 한 줄에 함께 없다.
describe('BoxPage 결과 보기·이어서 하기', () => {
  const at = '2026-10-02T00:00:00.000Z'
  const launched: BoxLine = {
    ...launchable, voucherId: 'v-done', unitsOfTest: 2, unitNo: 1, firstLaunchedAt: at,
    status: { label: '실시함 (10-02)', tone: 'info', actions: ['result'] },
  }
  const inProgress: BoxLine = { ...launched, voucherId: 'v-prog', status: { label: '응시 중', tone: 'info', actions: ['continue'] } }
  const fresh: BoxLine = { ...launchable, voucherId: 'v-new', unitsOfTest: 2, unitNo: 2 }
  const CHOOSE = '이어서 할까요, 새 1매를 쓸까요?'

  // 실시 주소를 열기까지의 호출을 모은다: 어떤 줄로 launch 를 불렀는지, 어디로 이동했는지
  function stubLaunch(lines: BoxLine[]) {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const ids: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^\/api\//, '')
      if (path === 'box') return json(200, boxOf(lines))
      if (path === 'voucher/launch') {
        const id = JSON.parse(String(init?.body)).voucherId as string
        ids.push(id)
        return json(200, { url: `https://exam.test/${id}` })
      }
      throw new Error(`unexpected call: ${path}`)
    }))
    return { assign, ids }
  }

  it('[결과 보기]는 선택 창 없이 바로 플랫폼 주소를 연다', async () => {
    const { assign, ids } = stubLaunch([launched, fresh])
    open()
    await userEvent.click(await screen.findByRole('button', { name: '결과 보기' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://exam.test/v-done'))
    expect(ids).toEqual(['v-done'])
    expect(screen.queryByText(CHOOSE)).toBeNull()
  })

  it('실시한 줄(결과 보기)이 같은 검사에 있어도 새 1매는 선택 창 없이 바로 실시한다', async () => {
    const { assign, ids } = stubLaunch([launched, fresh])
    open()
    await userEvent.click(await screen.findByRole('button', { name: '실시하기' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://exam.test/v-new'))
    expect(ids).toEqual(['v-new'])
    expect(screen.queryByText(CHOOSE)).toBeNull()
  })

  it('같은 검사에 응시 중(이어서 하기)인 줄이 있으면 [실시하기]가 선택 창을 먼저 연다', async () => {
    const { assign, ids } = stubLaunch([inProgress, fresh])
    open()
    await userEvent.click(await screen.findByRole('button', { name: '실시하기' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(CHOOSE)).toBeTruthy()
    expect(ids).toEqual([])
    await userEvent.click(within(dialog).getByRole('button', { name: '이어서 하기' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://exam.test/v-prog'))
    expect(ids).toEqual(['v-prog'])
  })

  it('선택 창에서 [새 1매 쓰기]를 고르면 새 줄로 실시한다', async () => {
    const { assign, ids } = stubLaunch([inProgress, fresh])
    open()
    await userEvent.click(await screen.findByRole('button', { name: '실시하기' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '새 1매 쓰기' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://exam.test/v-new'))
    expect(ids).toEqual(['v-new'])
  })

  it('응시 중인 줄의 [이어서 하기]는 선택 창 없이 바로 그 줄로 연다', async () => {
    const { assign, ids } = stubLaunch([inProgress, fresh])
    open()
    await userEvent.click(await screen.findByRole('button', { name: '이어서 하기' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://exam.test/v-prog'))
    expect(ids).toEqual(['v-prog'])
    expect(screen.queryByText(CHOOSE)).toBeNull()
  })

  it('실시한 줄도 [코드 보기]로 코드를 볼 수 있다', async () => {
    stubApi([launched], { 'voucher/code': async () => json(200, { code: 'TEST-0002-0001' }) })
    open()
    await userEvent.click(await screen.findByRole('button', { name: '코드 보기' }))
    expect(await screen.findByText(/TEST-0002-0001/)).toBeTruthy()
  })
})
