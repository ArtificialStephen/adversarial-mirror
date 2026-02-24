import React from 'react'
import { Box, Text } from 'ink'

interface BrainPanelProps {
  title: string
  children?: React.ReactNode
  /** Explicit column width (including border + padding). Takes priority over flex. */
  width?: number
  /** Flex mode: grow equally with siblings so two panels share available space. */
  flex?: boolean
  marginRight?: number
}

export function BrainPanel({
  title,
  children,
  width,
  flex = false,
  marginRight,
}: BrainPanelProps): JSX.Element {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      flexGrow={flex ? 1 : width ? 0 : 1}
      flexShrink={1}
      flexBasis={flex ? 0 : undefined}
      minWidth={0}
      width={width}
      marginRight={marginRight}
    >
      <Text bold color="cyan">{title}</Text>
      {children}
    </Box>
  )
}
