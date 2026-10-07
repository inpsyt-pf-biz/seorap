import { Snackbar } from '@mui/material'
import { tokens } from '../theme/seorap'

// MUI 기본 토스트는 폭 600px 이상에서 위치(left 50% 등)를 따로 정한다. 그 구간에서도 우리 값이 이기도록 같은 값을 두 구간에 다 준다.
const both = <T extends string | number>(v: T) => ({ xs: v, sm: v })

// 성공 안내 토스트. 화면 아래 가운데, 주 컬럼 폭 안에서 3초 뒤에 사라진다. 오류는 토스트가 아니라 화면 위 경고 창으로 보인다.
// 새 안내를 보일 때는 호출하는 쪽이 key 를 바꿔 새로 띄운다 (3초 타이머도 처음부터 다시 센다).
export default function Toast({ message, open, onClose }: { message: string; open: boolean; onClose: () => void }) {
  return (
    <Snackbar
      open={open}
      message={message}
      autoHideDuration={3000}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      // 바깥을 눌러도 닫지 않는다 (읽을 시간을 보장). 3초가 지나면 닫힌다.
      onClose={(_, reason) => { if (reason !== 'clickaway') onClose() }}
      // 화면 가운데에 내용 폭으로 놓이는 기본 배치 대신, 주 컬럼과 같은 폭(폰에서는 꽉 차게)으로 가운데에 둔다.
      // 아래 여백은 홈 표시줄 같은 안전 영역만큼 띄운다. 양옆은 페이지와 같은 16px.
      sx={{
        left: both(0), right: both(0), transform: both('none'), bottom: both('calc(16px + env(safe-area-inset-bottom))'),
        mx: 'auto', width: '100%', maxWidth: tokens.layout.maxWidth, px: 2, pointerEvents: 'none',
      }}
      // 넓은 화면에서 안내 상자가 내용 폭으로 줄지 않고 컬럼 폭을 채운다
      slotProps={{ content: { sx: { flexGrow: both(1), pointerEvents: 'auto' } } }}
    />
  )
}
