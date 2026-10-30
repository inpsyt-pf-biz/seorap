import { Link, Stack } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { t } from '@core/copy.ko.ts'

// 서랍의 바닥. 내용이 끝난 자리에 조용히 두어 화면이 "시작만 하고 끝나지 않는" 느낌을 없앤다 (10-30 비평 ①).
// 여기서 도움말(문자 안 옴·링크 분실·사칭 안내)로 갈 수 있다
export default function BoxFloor() {
  return (
    <Stack
      data-region="floor" direction="row"
      sx={{ alignItems: 'center', justifyContent: 'space-between', pt: 2, borderTop: 1, borderColor: 'divider' }}
    >
      <Link component={RouterLink} to="/help" variant="body2" sx={{ color: 'text.secondary', textDecorationColor: 'currentColor' }}>{t('help.title')}</Link>
    </Stack>
  )
}
