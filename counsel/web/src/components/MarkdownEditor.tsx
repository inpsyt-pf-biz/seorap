import '@mdxeditor/editor/style.css'
import {
  BoldItalicUnderlineToggles, CreateLink, linkDialogPlugin, linkPlugin, listsPlugin, ListsToggle, MDXEditor, Separator, toolbarPlugin, UndoRedo,
} from '@mdxeditor/editor'
import { Box, FormHelperText, Typography } from '@mui/material'
import { editorText } from '@counsel-core/help.ts'
import { isAllowedUrl } from '@seorap-core/helpContent.ts'
import { tokens } from '../theme/admin'

// 도움말 답·문의처 에디터 (10-30, 건우님: 외부 에디터로). MDXEditor 로 서식이 보이는 채로 고치고, 저장은 마크다운.
// 서랍 도움말이 그리는 서식만 넣는다: 굵게·기울임·글머리·번호 목록·링크. 제목·표·이미지·코드는 플러그인을 넣지 않아 만들 수 없다.
// MDXEditor 는 처음 값만 읽으므로, 다른 질문으로 바꿀 때는 부모가 key 를 바꿔 새로 띄운다
type Props = { label: string; value: string; onChange: (v: string) => void; maxLength: number; error?: string }

const toolbar = () => (
  <>
    <UndoRedo />
    <Separator />
    <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
    <Separator />
    <ListsToggle options={['bullet', 'number']} />
    <Separator />
    <CreateLink />
  </>
)

export default function MarkdownEditor({ label, value, onChange, maxLength, error }: Props) {
  const count = [...value].length
  const bad = !!error || count > maxLength
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>{label}</Typography>
      <Box sx={{
        border: `1px solid ${bad ? tokens.tone.caution.fg : tokens.surface[300]}`, borderRadius: tokens.radius.control, bgcolor: tokens.surface[0],
        overflow: 'hidden',
        '& [role="toolbar"]': { bgcolor: tokens.surface[50], borderRadius: 0 },
        '& [contenteditable="true"]': { minHeight: 96, px: 1.5, py: 1, fontFamily: 'inherit', fontSize: '0.95rem', lineHeight: 1.6 },
      }}>
        <MDXEditor
          markdown={value} onChange={(md) => onChange(md)} translation={editorText}
          toMarkdownOptions={{ bullet: '-', emphasis: '*', strong: '*' }}
          plugins={[listsPlugin(), linkPlugin({ validateUrl: isAllowedUrl }), linkDialogPlugin(), toolbarPlugin({ toolbarContents: toolbar })]}
        />
      </Box>
      <FormHelperText error={bad}>{error || `${count} / ${maxLength}`}</FormHelperText>
    </Box>
  )
}
