import React from 'react'
import { Box, Text } from 'ink'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface StreamingTextProps {
  value: string
  dim?: boolean
  /** Show spinner — use while waiting for the first token. */
  waiting?: boolean
  /** Shared spinner frame index driven by mirror-app's single interval. */
  spinnerFrame?: number
  /**
   * Lock the component to exactly this many lines.
   * Pads with blank lines so side-by-side panels never change height
   * independently, which prevents Ink from re-measuring the layout on
   * every tick and causing jumpy parallel rendering.
   */
  maxLines?: number
}

export function StreamingText({
  value,
  dim,
  waiting,
  spinnerFrame = 0,
  maxLines = 8,
}: StreamingTextProps): JSX.Element {
  // Split into individual lines. No trailing-empty-line handling needed here
  // because liveLines() already strips them before passing the value in.
  const contentLines = value ? value.split('\n') : []
  const padCount = Math.max(0, maxLines - contentLines.length)
  const showSpinner = waiting && contentLines.length === 0

  return (
    <Box flexDirection="column">
      {/* Content lines — each rendered as its own <Text> for stable layout */}
      {contentLines.map((line, i) => {
        const isLast = i === contentLines.length - 1
        return (
          <Text key={i} dimColor={dim} wrap="truncate">
            {line || ' '}
            {isLast && <Text color="#89dceb">▌</Text>}
          </Text>
        )
      })}

      {/* Spinner on the first visible row when nothing has arrived yet */}
      {showSpinner && (
        <Text color="#74c7ec" dimColor>
          {SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length]}{'  waiting...'}
        </Text>
      )}

      {/* Blank padding rows — keeps the panel height at exactly maxLines
          so the layout never shifts as content arrives token by token. */}
      {Array.from({ length: showSpinner ? padCount - 1 : padCount }).map((_, i) => (
        <Text key={`pad${i}`}>{' '}</Text>
      ))}
    </Box>
  )
}
