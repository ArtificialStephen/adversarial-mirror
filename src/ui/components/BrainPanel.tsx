import React from 'react'
import { Box, Text } from 'ink'

interface BrainPanelProps {
  title: string
  children?: React.ReactNode
  width?: number
  marginRight?: number
}

export function BrainPanel({
  title,
  children,
  width,
  marginRight
}: BrainPanelProps): JSX.Element {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      flexGrow={width ? 0 : 1}
      flexShrink={width ? 0 : 1}
      flexBasis={width ? undefined : 0}
      minWidth={0}
      width={width}
      marginRight={marginRight}
    >
      <Text>{title}</Text>
      {children}
    </Box>
  )
}
