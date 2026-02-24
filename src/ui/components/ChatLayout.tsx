import React from 'react'
import { Box, useStdout } from 'ink'

interface ChatLayoutProps {
  children: React.ReactNode
  layout?: 'side-by-side' | 'stacked'
  breakpoint?: number
}

export function ChatLayout({
  children,
  layout = 'side-by-side',
  breakpoint = 100
}: ChatLayoutProps): JSX.Element {
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 120
  const useStacked = layout === 'stacked' || columns < breakpoint

  return <Box flexDirection={useStacked ? 'column' : 'row'}>{children}</Box>
}
