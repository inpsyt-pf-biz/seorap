import { Button, Stack, Typography } from '@mui/material'
import { t } from '@core/copy.ko.ts'
import Wordmark from './Wordmark'

// 서랍 안 화면(내 검사·전달 이력)의 공용 머리글. 탭을 오가도 틀이 바뀌지 않게 한다 (UX 진단: 전달 이력에서 머리글이 사라짐)
// ownerName 이 없으면(전달 이력을 새로 열었을 때) 제목만 생략한다
export default function BoxHeader({ ownerName, onLogout }: { ownerName?: string | null; onLogout: () => void }) {
  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Wordmark />
        <Button variant="text" onClick={onLogout}>{t('box.logout')}</Button>
      </Stack>
      {ownerName && <Typography variant="h5">{t('box.title', { name: ownerName })}</Typography>}
    </>
  )
}
