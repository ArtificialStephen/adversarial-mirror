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
      marginRight={1}
      flexGrow={1}
    >
      <Text>{title}</Text>
      {children}
    </Box>
  )
}
