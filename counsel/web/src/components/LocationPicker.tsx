import { useEffect, useRef } from 'react'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { t } from '@counsel-core/copy.ko.ts'
import { KOREA_VIEW, SIDO_ANCHORS, isInKorea, type LatLng } from '@counsel-core/geo.ts'
import type { Region } from '@counsel-core/regions.ts'
import { MAP_ERROR_COPY, useNaverMaps } from '../lib/naverMaps'
import { mapLook } from '../theme/admin'
import { centerPinHtml } from './mapMarkers'

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

type Props = {
  value: LatLng | null
  onChange?: (v: LatLng | null) => void
  // 위치가 아직 없을 때 처음 보여 줄 시·도
  sido?: string
  readOnly?: boolean
  error?: string
}

// 지도에서 센터 위치를 찍는다. 지도를 누르면 핀이 생기고, 핀은 끌어서 옮긴다. readOnly 면 보기만 한다.
export default function LocationPicker({ value, onChange, sido, readOnly = false, error }: Props) {
  const { maps, error: loadError } = useNaverMaps()
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<naver.maps.Map | null>(null)
  const markerRef = useRef<naver.maps.Marker | null>(null)
  const changeRef = useRef(onChange)
  changeRef.current = onChange

  const anchor = sido && sido in SIDO_ANCHORS ? SIDO_ANCHORS[sido as Region] : null
  // 지도를 처음 만들 때의 위치. 이후 값이 바뀌면 지도를 다시 만들지 않고 핀만 옮긴다.
  const initial = useRef({ value, anchor })

  // 지도는 한 번만 만든다. 처음 위치: 찍은 곳 → 고른 시·도 → 전국
  useEffect(() => {
    if (!maps || !box.current) return
    const { value: v0, anchor: a0 } = initial.current
    const start = v0 ?? a0
    const map = new maps.Map(box.current, {
      center: new maps.LatLng(start?.lat ?? KOREA_VIEW.lat, start?.lng ?? KOREA_VIEW.lng),
      zoom: v0 ? 15 : a0 ? 11 : KOREA_VIEW.zoom,
      zoomControl: true,
      zoomControlOptions: { position: maps.Position.TOP_RIGHT },
      mapDataControl: false,
      draggable: true,
      scrollWheel: !readOnly,
    })
    mapRef.current = map
    const listeners: naver.maps.MapEventListener[] = []
    if (!readOnly) {
      listeners.push(maps.Event.addListener(map, 'click', (e: naver.maps.PointerEvent) => {
        const p = { lat: round6(e.coord.y), lng: round6(e.coord.x) }
        if (isInKorea(p)) changeRef.current?.(p)
      }))
    }
    return () => {
      listeners.forEach((l) => maps.Event.removeListener(l))
      markerRef.current?.setMap(null)
      markerRef.current = null
      map.destroy()
      mapRef.current = null
    }
  }, [maps, readOnly])

  // 핀을 값에 맞춘다
  useEffect(() => {
    const map = mapRef.current
    if (!maps || !map) return
    if (!value) {
      markerRef.current?.setMap(null)
      markerRef.current = null
      return
    }
    const pos = new maps.LatLng(value.lat, value.lng)
    if (markerRef.current) {
      markerRef.current.setPosition(pos)
      return
    }
    const m = new maps.Marker({ map, position: pos, draggable: !readOnly, icon: { content: centerPinHtml(true), anchor: new maps.Point(0, 0) } })
    if (!readOnly) {
      maps.Event.addListener(m, 'dragend', () => {
        const c = m.getPosition() as naver.maps.LatLng
        const p = { lat: round6(c.lat()), lng: round6(c.lng()) }
        changeRef.current?.(isInKorea(p) ? p : value)
      })
    }
    markerRef.current = m
  }, [maps, value, readOnly])

  // 위치가 없을 때 시·도를 바꾸면 그 시·도로 옮겨 준다
  useEffect(() => {
    const map = mapRef.current
    if (!maps || !map || value || !anchor) return
    map.morph(new maps.LatLng(anchor.lat, anchor.lng), 11)
  }, [maps, anchor, value])

  if (loadError) return <Alert severity="warning">{t(MAP_ERROR_COPY[loadError])}</Alert>

  return (
    <Stack spacing={1}>
      <Box ref={box} sx={{
        height: readOnly ? mapLook.detailHeight : mapLook.pickerHeight, width: '100%', borderRadius: 2, overflow: 'hidden',
        border: 1, borderColor: error ? 'error.main' : 'divider',
      }} />
      {!readOnly && (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color={error ? 'error' : 'text.secondary'} sx={{ flexGrow: 1 }}>
            {error ?? (value ? t('picker.value', { lat: value.lat, lng: value.lng }) : t('picker.help'))}
          </Typography>
          {value && <Button size="small" onClick={() => onChange?.(null)}>{t('picker.clear')}</Button>}
        </Stack>
      )}
    </Stack>
  )
}
