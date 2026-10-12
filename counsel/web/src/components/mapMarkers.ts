// 네이버 지도 마커 모양(HTML). 사용자가 입력한 글자(기관명 등)는 여기에 넣지 않는다. 기관명은 마커의 title 과 React 화면으로만 보인다.
import { t } from '@counsel-core/copy.ko.ts'
import type { Region } from '@counsel-core/regions.ts'
import { mapLook } from '../theme/admin'

export function sidoBubbleHtml(sido: Region, count: number): string {
  return `<div style="transform:translate(-50%,-50%);padding:6px 12px;border-radius:999px;white-space:nowrap;cursor:pointer;`
    + `background:${mapLook.bubbleBg};color:${mapLook.bubbleFg};box-shadow:${mapLook.shadow};font:700 13px/1.2 Pretendard,sans-serif">`
    + `${t('map.sidoCount', { sido, n: count })}</div>`
}

export function centerPinHtml(selected: boolean): string {
  const size = selected ? 24 : 18
  return `<div style="transform:translate(-50%,-50%);width:${size}px;height:${size}px;border-radius:50%;cursor:pointer;`
    + `background:${mapLook.pinFill};border:3px solid ${mapLook.pinBorder};box-shadow:${mapLook.shadow}"></div>`
}
