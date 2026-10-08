import { Box } from '@mui/material'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import { centerListLook } from '../theme/admin'

// 기관명 앞에 붙는 아이콘
export default function CenterAvatar({ size = 36 }: { size?: number }) {
  return (
    <Box aria-hidden sx={{
      width: size, height: size, flexShrink: 0, borderRadius: 2.5, display: 'grid', placeItems: 'center',
      background: centerListLook.avatarBg, color: centerListLook.avatarFg,
    }}>
      <HomeOutlined fontSize="small" />
    </Box>
  )
}
