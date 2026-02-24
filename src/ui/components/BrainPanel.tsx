import React from 'react'
import { Box, Text } from 'ink'

interface BrainPanelProps {
  title: string
  children?: React.ReactNode
}

export function BrainPanel({ title, children }: BrainPanelProps): JSX.Element {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      flexGrow={1}
      flexBasis={0}
      minWidth={0}
    >
      <Text>{title}</Text>
      {children}
    </Box>
  )
}
