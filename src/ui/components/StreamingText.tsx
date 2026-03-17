import React, { useEffect, useState } from 'react'
import { Text } from 'ink'

interface StreamingTextProps {
  value: string
  dim?: boolean
  /** Show animated spinner instead of cursor — use when waiting for first token. */
  waiting?: boolean
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function StreamingText({ value, dim, waiting }: StreamingTextProps): JSX.Element {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (!waiting) return
    const id = setInterval(() => setFrame(f => (f + 1) % SPINNER_FRAMES.length), 80)
    return () => clearInterval(id)
  }, [waiting])

  if (waiting && !value) {
    return (
      <Text color="cyan" dimColor>
        {SPINNER_FRAMES[frame]}{'  waiting for response...'}
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
