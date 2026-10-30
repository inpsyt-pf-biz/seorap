import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, ButtonBase, Dialog, InputBase, Stack, Typography } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import type { Center } from '@counsel-core/centers.ts'
import { matchPurchase, matchText } from '@counsel-core/commandSearch.ts'
import { t, type CopyKey } from '@counsel-core/copy.ko.ts'
import type { FormTemplateRow } from '@counsel-core/forms.ts'
import { STAGES, STAGE_TODO, STAGE_UNASSIGNED, clientLabel, contactLabel, type PurchaseRow } from '@counsel-core/purchases.ts'
import { listCenters, listFormTemplates, listPurchases } from '../lib/api'
import { usePageCommandList, type Command } from '../shell/commands'
import { hasCap, useSession } from '../shell/session'
import { tokens } from '../theme/admin'

// Ctrl+K(맥은 ⌘K) 또는 / 로 여는 명령 팔레트. 구매 건(이름·연락처·상품주문번호), 협력센터, 신청서 템플릿을 찾고,
// 화면 이동·구매 건 보기(할 일, 단계)·지금 화면의 명령(기간, 탭)을 실행한다. 목록은 처음 열 때 한 번 읽는다.
const MAX = { purchases: 6, centers: 4, forms: 3 } as const
const BASE = '/admin/counsel'

type Group = { key: CopyKey; items: Command[] }
type Data = { purchases: PurchaseRow[]; centers: Center[]; forms: FormTemplateRow[] }

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { state } = useSession()
  const pageCommands = usePageCommandList()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [data, setData] = useState<Data | null>(null)
  const loading = useRef(false)
  const list = useRef<HTMLDivElement>(null)

  // 열 때마다 빈 검색어로. 목록이 나중에 도착해도 그사이 친 검색어는 그대로 둔다
  useEffect(() => { if (open) { setQ(''); setActive(0) } }, [open])
  useEffect(() => {
    if (!open || data || loading.current) return
    loading.current = true
    Promise.all([listPurchases(), listCenters(), listFormTemplates()]).then(
      ([purchases, centers, forms]) => setData({ purchases, centers, forms }),
      () => setData({ purchases: [], centers: [], forms: [] }),
    ).finally(() => { loading.current = false })
  }, [open, data])

  const go = (to: string) => () => navigate(to)
  const views: Command[] = useMemo(() => [
    { id: 'view-todo', label: t('palette.view', { name: t('purchases.col.todo') }), keywords: '할일 todo', run: go(`${BASE}/purchases?stage=${STAGE_TODO}`) },
    ...STAGES.map((s) => ({ id: `view-${s}`, label: t('palette.view', { name: t(`purchases.stage.${s}` as CopyKey) }), run: go(`${BASE}/purchases?stage=${s}`) })),
    { id: 'view-unassigned', label: t('palette.view', { name: t('progressCell.unassigned') }), keywords: '미배정 센터 배정', run: go(`${BASE}/purchases?stage=${STAGE_UNASSIGNED}`) },
    { id: 'view-unable', label: t('palette.view', { name: t('session.status.unable') }), keywords: '불가 다시 배정', run: go(`${BASE}/purchases?stage=booking:unable`) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [])
  const places: Command[] = useMemo(() => [
    { id: 'go-purchases', label: t('nav.purchases'), run: go(`${BASE}/purchases`) },
    ...(hasCap(state, 'purchase.manage') ? [{ id: 'go-create', label: t('purchases.create'), keywords: '새 구매 등록 협찬', run: go(`${BASE}/purchases/new`) }] : []),
    { id: 'go-inbox', label: t('palette.go.inbox'), run: go(`${BASE}/purchases/inbox`) },
    { id: 'go-centers', label: t('nav.centers'), run: go(`${BASE}/centers`) },
    { id: 'go-forms', label: t('palette.go.forms'), run: go(`${BASE}/forms`) },
    { id: 'go-links', label: t('palette.go.links'), run: go(`${BASE}/forms/links`) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [state])

  const groups: Group[] = useMemo(() => {
    const pick = (items: Command[]) => items.filter((c) => matchText(q, c.label, c.keywords, c.hint))
    const out: Group[] = [
      { key: 'palette.group.page', items: pick(pageCommands) },
      { key: 'palette.group.view', items: pick(views) },
      { key: 'palette.group.go', items: pick(places) },
    ]
    if (q.trim() && data) {
      out.push({
        key: 'palette.group.purchases',
        items: data.purchases.filter((r) => matchPurchase(q, r)).slice(0, MAX.purchases).map((r) => ({
          id: `p-${r.id}`, label: [clientLabel(r), contactLabel(r)].filter(Boolean).join(' · '),
          hint: [r.product_name, r.naver_product_orders?.naver_product_order_id].filter(Boolean).join(' · '),
          run: () => navigate(`${BASE}/purchases/${r.id}`, { state: { back: `${BASE}/purchases` } }),
        })),
      })
      out.push({ key: 'palette.group.centers', items: data.centers.filter((c) => matchText(q, c.name)).slice(0, MAX.centers).map((c) => ({ id: `c-${c.id}`, label: c.name, run: go(`${BASE}/centers/${c.id}`) })) })
      out.push({ key: 'palette.group.forms', items: data.forms.filter((f) => matchText(q, f.name)).slice(0, MAX.forms).map((f) => ({ id: `f-${f.id}`, label: f.name, run: go(`${BASE}/forms/${f.id}`) })) })
    }
    return out.filter((g) => g.items.length > 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, data, pageCommands, views, places])

  const flat = groups.flatMap((g) => g.items)
  const pick = (c: Command | undefined) => { if (!c) return; onClose(); c.run() }
  const onKey = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.max(0, Math.min(flat.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)))
      setActive(next)
      list.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' })
    }
    if (e.key === 'Enter') { e.preventDefault(); pick(flat[active]) }
  }

  let index = -1
  return (
    // 열자마자 칠 수 있게 나타나는 움직임 없이 연다(움직이는 동안 친 글자가 사라졌다)
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" transitionDuration={{ enter: 0, exit: 120 }}
      slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: '12vh', borderRadius: tokens.radius.card } } }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25, px: 2, height: 52, borderBottom: `1px solid ${tokens.surface[200]}` }}>
        <SearchIcon sx={{ color: 'text.secondary' }} />
        <InputBase autoFocus fullWidth value={q} placeholder={t('palette.placeholder')} onChange={(e) => { setQ(e.target.value); setActive(0) }} onKeyDown={onKey}
          inputProps={{ 'aria-label': t('palette.open'), role: 'combobox', 'aria-expanded': true, 'aria-controls': 'palette-list', 'aria-activedescendant': flat[active] ? `palette-${flat[active].id}` : undefined }} />
      </Stack>
      <Box ref={list} id="palette-list" role="listbox" sx={{ maxHeight: 420, overflowY: 'auto', py: 1 }}>
        {groups.map((g) => (
          <Box key={g.key} role="group" aria-label={t(g.key)} sx={{ pb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2, py: 0.75 }}>{t(g.key)}</Typography>
            {g.items.map((c) => {
              index += 1
              const i = index
              return (
                <ButtonBase key={c.id} id={`palette-${c.id}`} role="option" aria-selected={i === active} data-index={i}
                  onClick={() => pick(c)} onMouseMove={() => setActive(i)}
                  sx={{ width: '100%', display: 'flex', justifyContent: 'flex-start', gap: 1.5, px: 2, py: 1, textAlign: 'left', bgcolor: i === active ? tokens.surface[100] : 'transparent' }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 500, flexShrink: 0, maxWidth: '55%' }}>{c.label}</Typography>
                  {c.hint && <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0 }}>{c.hint}</Typography>}
                </ButtonBase>
              )
            })}
          </Box>
        ))}
        {flat.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>{q.trim() && !data ? t('palette.loading') : t('palette.empty')}</Typography>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2, py: 1, borderTop: `1px solid ${tokens.surface[200]}` }}>{t('palette.hint')}</Typography>
    </Dialog>
  )
}
