import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material'
import { locationLabel, type Center } from '@counsel-core/centers.ts'
import { t } from '@counsel-core/copy.ko.ts'
import { KOREA_VIEW, SIDO_ANCHORS, groupBySido, hasCoordinates } from '@counsel-core/geo.ts'
import { MAP_ERROR_COPY, useNaverMaps } from '../lib/naverMaps'
import { mapLook } from '../theme/admin'
import SpecialtyChips from './SpecialtyChips'
import CenterAvatar from './CenterAvatar'
import { centerPinHtml, sidoBubbleHtml } from './mapMarkers'

// 이 확대 단계부터 시·도 동그라미 대신 센터별 핀을 보인다
const PIN_ZOOM = 10

export default function CentersMap({ centers, onOpen }: { centers: Center[]; onOpen: (id: string) => void }) {
  const { maps, error } = useNaverMaps()
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<naver.maps.Map | null>(null)
  const [zoom, setZoom] = useState<number>(KOREA_VIEW.zoom)
  const [selected, setSelected] = useState<Center | null>(null)

  useEffect(() => {
    if (!maps || !box.current) return
    const map = new maps.Map(box.current, {
      center: new maps.LatLng(KOREA_VIEW.lat, KOREA_VIEW.lng),
      zoom: KOREA_VIEW.zoom,
      minZoom: 6,
      zoomControl: true,
      zoomControlOptions: { position: maps.Position.TOP_RIGHT },
      mapDataControl: false,
      scaleControl: true,
    })
    mapRef.current = map
    const zl = maps.Event.addListener(map, 'zoom_changed', (z: number) => setZoom(z))
    const cl = maps.Event.addListener(map, 'click', () => setSelected(null))
    return () => {
      maps.Event.removeListener(zl)
      maps.Event.removeListener(cl)
      map.destroy()
      mapRef.current = null
    }
  }, [maps])

  useEffect(() => {
    const map = mapRef.current
    if (!maps || !map) return
    const markers: naver.maps.Marker[] = []
    if (zoom < PIN_ZOOM) {
      for (const g of groupBySido(centers)) {
        const a = SIDO_ANCHORS[g.sido]
        const m = new maps.Marker({
          map, position: new maps.LatLng(a.lat, a.lng), title: t('map.sidoCount', { sido: g.sido, n: g.count }),
          icon: { content: sidoBubbleHtml(g.sido, g.count), anchor: new maps.Point(0, 0) },
        })
        maps.Event.addListener(m, 'click', () => {
          // 그 시·도 센터들이 한 화면에 들어오게 확대한다. 위치가 하나도 없으면 동그라미 자리로 확대한다.
          const pins = centers.filter((c) => c.location_sido === g.sido).filter(hasCoordinates)
          if (pins.length > 1) {
            const bounds = new maps.LatLngBounds(new maps.LatLng(pins[0].latitude, pins[0].longitude), new maps.LatLng(pins[0].latitude, pins[0].longitude))
            pins.forEach((c) => bounds.extend(new maps.LatLng(c.latitude, c.longitude)))
            map.fitBounds(bounds, { top: 100, right: 100, bottom: 100, left: 100 })
            if (map.getZoom() < PIN_ZOOM) map.setZoom(PIN_ZOOM)
          } else {
            const p = pins[0] ? { lat: pins[0].latitude, lng: pins[0].longitude } : a
            map.morph(new maps.LatLng(p.lat, p.lng), pins[0] ? 13 : PIN_ZOOM)
          }
        })
        markers.push(m)
      }
    } else {
      for (const c of centers.filter(hasCoordinates)) {
        const m = new maps.Marker({
          map, position: new maps.LatLng(c.latitude, c.longitude), title: c.name,
          icon: { content: centerPinHtml(selected?.id === c.id), anchor: new maps.Point(0, 0) },
        })
        maps.Event.addListener(m, 'click', () => setSelected(c))
        markers.push(m)
      }
    }
    return () => markers.forEach((m) => m.setMap(null))
  }, [maps, centers, zoom, selected])

  // 거르기로 선택한 센터가 빠지면 카드도 닫는다
  useEffect(() => {
    if (selected && !centers.some((c) => c.id === selected.id)) setSelected(null)
  }, [centers, selected])

  if (error) return <Alert severity="warning">{t(MAP_ERROR_COPY[error])}</Alert>

  const noPin = centers.filter((c) => !hasCoordinates(c))

  return (
    <Stack spacing={1.5}>
      <Paper sx={{ position: 'relative', borderRadius: 4, overflow: 'hidden' }}>
        <Box ref={box} sx={{ height: mapLook.mapHeight, width: '100%' }} />
        {selected && (
          <Paper sx={{ position: 'absolute', left: 16, bottom: 16, p: 2, width: 320, maxWidth: 'calc(100% - 32px)', zIndex: 10 }}>
            <Stack spacing={1.25}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <CenterAvatar size={32} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body1" noWrap sx={{ fontWeight: 700 }}>{selected.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{locationLabel(selected.location_sido, selected.location_sigungu)}</Typography>
                </Box>
              </Stack>
              <SpecialtyChips values={selected.specialties} />
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setSelected(null)}>{t('map.close')}</Button>
                <Button size="small" variant="contained" onClick={() => onOpen(selected.id)}>{t('map.openDetail')}</Button>
              </Stack>
            </Stack>
          </Paper>
        )}
      </Paper>
      <Typography variant="caption" color="text.secondary">{t('map.hint')}</Typography>
      {noPin.length > 0 && (
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">{t('map.noPin', { n: noPin.length })}</Typography>
          {noPin.map((c) => <Button key={c.id} size="small" variant="outlined" onClick={() => onOpen(c.id)}>{c.name}</Button>)}
        </Stack>
      )}
    </Stack>
  )
}
