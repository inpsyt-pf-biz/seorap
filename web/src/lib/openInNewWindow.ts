// 실시하기·결과 보기: 검사 화면을 새 창으로 연다 (10-29 건우님 검수: 서랍은 그대로 두고 검사만 따로).
// 서버에서 주소를 받은 뒤 window.open 을 부르면 누른 순간과 떨어져 팝업 차단에 걸린다.
// 그래서 누르는 순간 빈 창을 먼저 열고, 주소를 받으면 그 창을 보낸다. 창을 못 열면 지금 창에서 연다
export async function openInNewWindow(getUrl: () => Promise<string>): Promise<void> {
  const win = window.open('', '_blank')
  let url: string
  try {
    url = await getUrl()
  } catch (e) {
    win?.close()
    throw e
  }
  if (win) {
    // 새 창이 서랍 창을 조작하지 못하게 끊는다 (noopener 와 같은 효과)
    win.opener = null
    win.location.href = url
  } else {
    window.location.assign(url)
  }
}
