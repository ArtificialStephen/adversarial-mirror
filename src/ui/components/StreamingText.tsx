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

type Span = { text: string; bold?: true; italic?: true; code?: true }

/**
 * Splits a line into styled spans for **bold**, *italic*, and `code`.
 * Processes left-to-right; ** takes priority over *.
 */
function parseInline(line: string): Span[] {
  const spans: Span[] = []
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) {
      spans.push({ text: line.slice(last, m.index) })
    }
    const tok = m[0]
    if (tok.startsWith('**')) {
      spans.push({ text: tok.slice(2, -2), bold: true })
    } else if (tok.startsWith('`')) {
      spans.push({ text: tok.slice(1, -1), code: true })
    } else {
      spans.push({ text: tok.slice(1, -1), italic: true })
    }
    last = m.index + tok.length
  }
  if (last < line.length) {
    spans.push({ text: line.slice(last) })
  }
  return spans
}

function renderSpans(spans: Span[], dim?: boolean): React.ReactNode {
  return spans.map((span, i) => {
    if (span.code) {
      return <Text key={i} color="#a6e3a1" dimColor={dim}>{span.text}</Text>
    }
    if (span.bold && span.italic) {
      return <Text key={i} bold italic dimColor={dim}>{span.text}</Text>
    }
    if (span.bold) {
      return <Text key={i} bold dimColor={dim}>{span.text}</Text>
    }
    if (span.italic) {
      return <Text key={i} italic dimColor={dim}>{span.text}</Text>
    }
    return <Text key={i} dimColor={dim}>{span.text}</Text>
  })
}

function StreamingTextInner({
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
        const spans = parseInline(line || ' ')
        return (
          <Text key={i} wrap="truncate">
            {renderSpans(spans, dim)}
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

/**
 * When the component is not waiting (no spinner), spinnerFrame changes are
 * irrelevant to the visual output. Skip re-renders in that case so Ink only
 * repaints panels whose content is actually changing.
 */
export const StreamingText = React.memo(StreamingTextInner, (prev, next) => {
  if (
    !prev.waiting &&
    !next.waiting &&
    prev.value === next.value &&
    prev.dim === next.dim &&
    prev.maxLines === next.maxLines
  ) {
    return true // treat as equal — skip re-render
  }
  return (
    prev.value === next.value &&
    prev.dim === next.dim &&
    prev.waiting === next.waiting &&
    prev.spinnerFrame === next.spinnerFrame &&
    prev.maxLines === next.maxLines
  )
})
