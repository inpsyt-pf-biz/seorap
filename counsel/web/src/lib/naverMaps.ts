// 네이버 지도 스크립트를 한 번만 불러온다. 키는 web/.env.local 의 VITE_NAVER_MAPS_KEY_ID(네이버 클라우드 Maps 의 Client ID).
import { useEffect, useState } from 'react'

export type MapLoadError = 'noKey' | 'authFailed' | 'loadFailed'

type NaverWindow = Window & { naver?: typeof naver; navermap_authFailure?: () => void }
const w = window as NaverWindow

let loading: Promise<typeof naver.maps> | null = null
let authFailed = false
const authListeners = new Set<() => void>()

function load(): Promise<typeof naver.maps> {
  const key = import.meta.env.VITE_NAVER_MAPS_KEY_ID
  if (!key) return Promise.reject<typeof naver.maps>('noKey')
  if (w.naver?.maps) return Promise.resolve(w.naver.maps)
  if (!loading) {
    // 키나 등록한 서비스 주소가 맞지 않으면 네이버가 이 함수를 부른다(스크립트를 받은 뒤, 지도를 그릴 때)
    w.navermap_authFailure = () => {
      authFailed = true
      authListeners.forEach((f) => f())
    }
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}`
      s.async = true
      s.onload = () => (w.naver?.maps ? resolve(w.naver.maps) : reject('loadFailed'))
      s.onerror = () => {
        loading = null
        s.remove()
        reject('loadFailed')
      }
      document.head.appendChild(s)
    })
  }
  return loading
}

// 지도 화면이 쓰는 훅. 불러오기 실패와, 불러온 뒤의 인증 실패를 모두 error 로 알려 준다.
export function useNaverMaps(): { maps: typeof naver.maps | null; error: MapLoadError | null } {
  const [maps, setMaps] = useState<typeof naver.maps | null>(null)
  const [error, setError] = useState<MapLoadError | null>(authFailed ? 'authFailed' : null)

  useEffect(() => {
    let alive = true
    const onAuthFail = () => { if (alive) setError('authFailed') }
    authListeners.add(onAuthFail)
    load().then(
      (m) => { if (alive) setMaps(m) },
      (e: MapLoadError) => { if (alive) setError(e) },
    )
    return () => {
      alive = false
      authListeners.delete(onAuthFail)
    }
  }, [])

  return { maps, error }
}

export const MAP_ERROR_COPY = {
  noKey: 'map.noKey',
  authFailed: 'map.authFailed',
  loadFailed: 'map.loadFailed',
} as const
