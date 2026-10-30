import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Stack, Typography } from '@mui/material'
import { type HelpContent, isAllowedUrl } from '@core/helpContent.ts'
import HelpMarkdown from './HelpMarkdown'

// 도움말 본문 (10-30): 질문 접힘 목록 + 링크 버튼 + 문의처. 서랍 도움말 화면과 상담 어드민 미리보기가 같은 부품을 쓴다.
// 버튼 주소는 여기서도 한 번 더 거른다(어드민 DB·서랍 서버·화면 세 곳에서 막는다). 어드민 미리보기의 초안 주소도 같다
export default function HelpArticle({ content }: { content: HelpContent }) {
  return (
    <Stack spacing={3}>
      {content.items.length > 0 && (
        <Box>
          {content.items.map((it) => (
            <Accordion key={it.id} disableGutters elevation={0}>
              <AccordionSummary><Typography variant="body1">{it.question}</Typography></AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.5} sx={{ color: 'text.secondary' }}>
                  <HelpMarkdown md={it.answerMd} />
                  {it.buttons.some((b) => isAllowedUrl(b.url)) && (
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                      {it.buttons.filter((b) => isAllowedUrl(b.url)).map((b) => (
                        <Button key={b.url + b.label} variant="outlined" size="small" href={b.url} target="_blank" rel="noopener noreferrer">{b.label}</Button>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}
      {content.contact && <Box sx={{ color: 'text.secondary' }}><HelpMarkdown md={content.contact} /></Box>}
    </Stack>
  )
}
