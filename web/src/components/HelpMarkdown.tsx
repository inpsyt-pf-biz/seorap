import { Box, Link, Typography } from '@mui/material'
import { Fragment } from 'react'
import { type Block, type Inline, parseHelpMarkdown } from '@core/helpContent.ts'

// 도움말 마크다운 (10-30). 정해진 서식만 그린다: HTML 은 글자 그대로, 허용하지 않은 주소는 링크가 되지 않는다(파서가 거른다)
function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((n, i) => {
    switch (n.kind) {
      case 'text': return <Fragment key={i}>{n.text}</Fragment>
      case 'br': return <br key={i} />
      case 'strong': return <strong key={i}><Inlines nodes={n.children} /></strong>
      case 'em': return <em key={i}><Inlines nodes={n.children} /></em>
      case 'link': return <Link key={i} href={n.href} target="_blank" rel="noopener noreferrer"><Inlines nodes={n.children} /></Link>
    }
  })
}

function BlockView({ b, variant }: { b: Block; variant: 'body1' | 'body2' }) {
  if (b.kind === 'p') return <Typography variant={variant} color="inherit"><Inlines nodes={b.children} /></Typography>
  return (
    <Box component={b.kind} sx={{ m: 0, pl: 2.5 }}>
      {b.items.map((it, i) => <Typography key={i} component="li" variant={variant} color="inherit"><Inlines nodes={it} /></Typography>)}
    </Box>
  )
}

export default function HelpMarkdown({ md, variant = 'body2' }: { md: string; variant?: 'body1' | 'body2' }) {
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {parseHelpMarkdown(md).map((b, i) => <BlockView key={i} b={b} variant={variant} />)}
    </Box>
  )
}
