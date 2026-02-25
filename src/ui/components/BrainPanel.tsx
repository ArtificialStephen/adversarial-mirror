import React from 'react'
import { Box, Text } from 'ink'

interface BrainPanelProps {
  title: string
  children?: React.ReactNode
  /** Explicit column width (outer, including border + padding). */
  width?: number
  marginRight?: number
  /** Border and title color. Defaults to 'cyan'. */
  borderColor?: string
}

export function BrainPanel({
  title,
  children,
  width,
  marginRight,
  borderColor = 'cyan',
}: BrainPanelProps): JSX.Element {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      padding={1}
      flexGrow={width ? 0 : 1}
      flexShrink={1}
      minWidth={0}
      width={width}
      marginRight={marginRight}
    >
      <Text bold color={borderColor}>{title}</Text>
      {children}
    </Box>
  )
}
