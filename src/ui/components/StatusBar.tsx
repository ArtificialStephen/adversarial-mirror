import React from 'react'
import { Box, Text } from 'ink'

interface StatusBarProps {
  text: string
}

export function StatusBar({ text }: StatusBarProps): JSX.Element {
  return (
    <Box>
      <Text>{text}</Text>
    </Box>
  )
}
