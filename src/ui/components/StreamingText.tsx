import React from 'react'
import { Text } from 'ink'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface StreamingTextProps {
  value: string
  dim?: boolean
  /** Show spinner instead of cursor — use while waiting for the first token. */
  waiting?: boolean
  /** Shared spinner frame index driven by mirror-app's single interval. */
  spinnerFrame?: number
}

export function StreamingText({ value, dim, waiting, spinnerFrame = 0 }: StreamingTextProps): JSX.Element {
  if (waiting && !value) {
    return (
      <Text color="cyan" dimColor>
        {SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length]}{'  waiting for response...'}
      </Text>
    )
  }

  return (
    <Text dimColor={dim} wrap="truncate">
      {value}
      <Text color="cyan">▌</Text>
    </Text>
  )
}
