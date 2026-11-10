import { Box, Button, ButtonBase, Drawer, Stack, Typography } from '@mui/material'
import { type ReactNode, useId } from 'react'
import type { FormField } from '@core/counselForm.ts'
import { t } from '@core/copy.ko.ts'
import { tokens } from '../theme/seorap'

// 약관 바텀시트 (11-10 건우님 검수: "보기를 누르면 펼쳐지는 게 아니라 바텀시트로, 은행 앱처럼 약관1 → 동의 → 약관2").
// 본문은 시트 안에서만 스크롤되고, 바닥의 [동의하기]는 늘 보인다. 여러 약관을 이어 보여 줄 때는 위에 "약관 1 / 2"를 단다.
// 선택 약관이면 [동의하지 않기]도 둔다. 바깥을 누르거나 [닫기]를 누르면 아무것도 바꾸지 않고 닫힌다
export default function ConsentSheet({ f, extra, count, onAgree, onDecline, onClose }: {
  f: FormField | null
  extra?: ReactNode
  count?: { i: number; n: number }
  onAgree: () => void
  onDecline?: () => void
  onClose: () => void
}) {
  const titleId = useId()
  return (
    <Drawer
      anchor="bottom" open={!!f} onClose={onClose}
      slotProps={{
        paper: {
          role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId,
          sx: {
            width: '100%', maxWidth: tokens.layout.maxWidth, left: 0, right: 0, mx: 'auto', maxHeight: '85%',
            borderTopLeftRadius: tokens.radius.sheet, borderTopRightRadius: tokens.radius.sheet,
          },
        },
      }}
    >
      {f && (
        <Box
          key={f.id}
          sx={{
            display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1,
            animation: 'sheetIn .18s ease-out',
            '@keyframes sheetIn': { from: { opacity: 0, transform: 'translateX(12px)' }, to: { opacity: 1, transform: 'none' } },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <Box sx={{ px: 2.5, pt: 1.25 }}>
            <Box aria-hidden sx={{ width: 36, height: 4, borderRadius: tokens.radius.pill, bgcolor: tokens.surface[300], mx: 'auto' }} />
            <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, pt: 1.5 }}>
              <Box>
                {count && count.n > 1 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{t('steps.sheet.count', { i: count.i, n: count.n })}</Typography>
                )}
                <Typography id={titleId} component="h3" variant="h6" sx={{ fontWeight: 700, lineHeight: 1.4, wordBreak: 'keep-all' }}>{f.label}</Typography>
              </Box>
              <ButtonBase onClick={onClose} aria-label={t('steps.sheet.close')} sx={{ width: 40, height: 40, mr: -1, flexShrink: 0, borderRadius: tokens.radius.pill }}>
                <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 20, height: 20, color: tokens.text.secondary }}>
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </Box>
              </ButtonBase>
            </Stack>
          </Box>
          <Stack spacing={2} sx={{ px: 2.5, py: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {f.help && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line', color: tokens.text.secondary, lineHeight: 1.7, wordBreak: 'keep-all' }}>{f.help}</Typography>
            )}
            {extra}
          </Stack>
          <Stack spacing={0.5} sx={{ px: 2.5, pt: 1.5, pb: 'calc(16px + env(safe-area-inset-bottom))', borderTop: `1px solid ${tokens.surface[200]}` }}>
            <Button variant="contained" size="large" fullWidth onClick={onAgree}>{t('steps.sheet.agree')}</Button>
            {onDecline && <Button variant="text" size="large" fullWidth onClick={onDecline}>{t('steps.sheet.decline')}</Button>}
          </Stack>
        </Box>
      )}
    </Drawer>
  )
}
