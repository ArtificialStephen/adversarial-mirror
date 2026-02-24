import React from 'react'
import { Text } from 'ink'

interface StreamingTextProps {
  value: string
  dim?: boolean
}

export function StreamingText({ value, dim }: StreamingTextProps): JSX.Element {
  return (
    <Text dimColor={dim} wrap="wrap">
      {value}
      <Text color="cyan">▌</Text>
    </Text>
  )
}
