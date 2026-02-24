import React from 'react'
import { Text } from 'ink'

interface InputPromptProps {
  placeholder?: string
}

export function InputPrompt({ placeholder = '> ' }: InputPromptProps): JSX.Element {
  return <Text>{placeholder}</Text>
}
