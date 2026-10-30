// 카카오톡 공유 (10-30). JavaScript 키는 화면 환경값 VITE_KAKAO_JS_KEY 에 둔다(저장소에는 넣지 않는다).
// 키가 없거나 SDK 를 못 불러오면 false 를 돌려, 전달 시트는 [직접 전달]만 보인다.
// 카카오 디벨로퍼스 [앱] > [플랫폼 키] > [JavaScript 키] > [JavaScript SDK 도메인]에 등록된 주소에서만 SDK 가 동작하고,
// 메시지 링크 주소는 [앱] > [제품 링크 관리] > [웹 도메인]에 따로 등록해야 열린다.

// 버전을 고정하고 무결성 해시로 확인한다. 올릴 때는 새 파일의 sha384 를 다시 계산해 둘 다 바꾼다.
export const KAKAO_SDK = {
  src: 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js',
  integrity: 'sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w',
}

type KakaoSdk = {
  isInitialized: () => boolean
  init: (key: string) => void
  Share: { sendDefault: (o: Record<string, unknown>) => void }
}
const sdk = () => (window as unknown as { Kakao?: KakaoSdk }).Kakao

let loading: Promise<boolean> | null = null

export function loadKakao(): Promise<boolean> {
  const key = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined
  if (!key) return Promise.resolve(false)
  if (loading) return loading
  const ready = () => {
    // SDK 2.x 는 init 한 뒤에야 Kakao.Share 를 붙인다
    const k = sdk()
    if (!k) return false
    if (!k.isInitialized()) k.init(key)
    return !!k.Share
  }
  if (sdk()) return (loading = Promise.resolve(ready()))
  loading = new Promise<boolean>((resolve) => {
    const s = document.createElement('script')
    s.src = KAKAO_SDK.src
    s.integrity = KAKAO_SDK.integrity
    s.crossOrigin = 'anonymous'
    s.async = true
    s.dataset.kakaoSdk = ''
    s.onload = () => resolve(ready())
    // 실패하면 다음에 다시 시도할 수 있게 비워 둔다
    s.onerror = () => { s.remove(); loading = null; resolve(false) }
    document.head.appendChild(s)
  })
  return loading
}

// 카카오 메시지는 글자형: 주소는 글자에 넣지 않고 [검사 열기] 버튼에 담는다
export function sendKakao(p: { text: string; url: string; buttonTitle: string }) {
  const k = sdk()
  if (!k) throw new Error('kakao sdk not loaded')
  k.Share.sendDefault({ objectType: 'text', text: p.text, link: { mobileWebUrl: p.url, webUrl: p.url }, buttonTitle: p.buttonTitle })
}

export function resetKakaoForTest() {
  loading = null
}
