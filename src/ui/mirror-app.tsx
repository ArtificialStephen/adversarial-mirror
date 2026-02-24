import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import type { BrainResult, IntentResult } from '../types/index.js'
import type { MirrorEngine } from '../engine/mirror-engine.js'
import { Session } from '../engine/session.js'
import { addHistoryEntry } from '../history/store.js'
import { BrainPanel } from './components/BrainPanel.js'
import { ChatLayout } from './components/ChatLayout.js'
import { IntentBadge } from './components/IntentBadge.js'
import { StatusBar } from './components/StatusBar.js'
import { StreamingText } from './components/StreamingText.js'
import { highlightCodeBlocks } from './utils/highlight.js'

interface Turn {
  question: string
  answer: string
}

interface MirrorAppProps {
  engine: MirrorEngine
  session: Session
  originalId: string
  challengerId?: string
  intensity: string
  layout?: 'side-by-side' | 'stacked'
  showTokenCounts?: boolean
  showLatency?: boolean
  syntaxHighlighting?: boolean
}

const headerArt = loadHeaderArt()

export function MirrorApp({
  engine,
  session,
  originalId,
  challengerId,
  intensity,
  layout,
  showTokenCounts = false,
  showLatency = true,
  syntaxHighlighting = true
}: MirrorAppProps): JSX.Element {
  const [input, setInput] = useState('')
  const [originalTurns, setOriginalTurns] = useState<Turn[]>([])
  const [challengerTurns, setChallengerTurns] = useState<Turn[]>([])
  const [currentOriginal, setCurrentOriginal] = useState('')
  const [currentChallenger, setCurrentChallenger] = useState('')
  const [activeQuestion, setActiveQuestion] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [intent, setIntent] = useState<IntentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runningRef = useRef(false)
  const startTimesRef = useRef<Map<string, number>>(new Map())
  const [originalStats, setOriginalStats] = useState<BrainResult | null>(null)
  const [challengerStats, setChallengerStats] = useState<BrainResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pendingOriginalRef = useRef('')
  const pendingChallengerRef = useRef('')
  const liveOriginalRef = useRef('')
  const liveChallengerRef = useRef('')
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 120

  const safeColumns = Math.max(1, columns - 1)
  const fittedHeaderArt = useMemo(
    () => fitHeaderArt(headerArt, safeColumns),
    [safeColumns]
  )
  const subheaderLine = fitLineToColumns('Adversarial Mirror', safeColumns)

  useEffect(() => {
    const timer = setInterval(() => {
      if (pendingOriginalRef.current !== liveOriginalRef.current) {
        liveOriginalRef.current = pendingOriginalRef.current
        setCurrentOriginal(liveOriginalRef.current)
      }
      if (pendingChallengerRef.current !== liveChallengerRef.current) {
        liveChallengerRef.current = pendingChallengerRef.current
        setCurrentChallenger(liveChallengerRef.current)
      }
    }, 60)
    return () => clearInterval(timer)
  }, [])

  const headerLines = fittedHeaderArt.length > 0
    ? [...fittedHeaderArt, subheaderLine]
    : [fitLineToColumns('A - MIRROR', safeColumns), subheaderLine]

  const submit = useCallback(async () => {
    if (runningRef.current) {
      return
    }

    const question = input.trim()
    if (!question) {
      return
    }

    runningRef.current = true
    setInput('')
    setError(null)
    setIntent(null)
    setActiveQuestion(question)
    setIsThinking(true)
    setCurrentOriginal('')
    setCurrentChallenger('')
    pendingOriginalRef.current = ''
    pendingChallengerRef.current = ''
    liveOriginalRef.current = ''
    liveChallengerRef.current = ''

    const history = session.getHistory()
    session.addUser(question)

    let originalBuffer = ''
    let challengerBuffer = ''
    let originalResult: BrainResult | null = null
    let challengerResult: BrainResult | undefined
    let intentResult: IntentResult | undefined
    const entryId = randomUUID()
    const createdAt = new Date().toISOString()
    const controller = new AbortController()
    abortRef.current = controller

    startTimesRef.current = new Map()
    startTimesRef.current.set(originalId, Date.now())
    if (challengerId) {
      startTimesRef.current.set(challengerId, Date.now())
    }

    try {
      for await (const event of engine.run(question, history, { signal: controller.signal })) {
        if (event.type === 'classifying') {
          setIntent(null)
        }

        if (event.type === 'classified') {
          setIntent(event.result)
          intentResult = event.result
        }

        if (event.type === 'stream_chunk') {
          if (event.brainId === originalId) {
            originalBuffer += event.chunk.delta
            pendingOriginalRef.current = originalBuffer
          } else if (event.brainId === challengerId) {
            challengerBuffer += event.chunk.delta
            pendingChallengerRef.current = challengerBuffer
          }
        }

        if (event.type === 'brain_complete') {
          if (event.brainId === originalId) {
            const answer = event.response.text || originalBuffer
            const latency =
              Date.now() - (startTimesRef.current.get(originalId) ?? Date.now())
            originalResult = {
              brainId: originalId,
              text: answer,
              inputTokens: event.response.inputTokens,
              outputTokens: event.response.outputTokens,
              latencyMs: latency
            }
            setOriginalStats(originalResult)
            session.addAssistant(answer)
            setOriginalTurns((prev) => [...prev, { question, answer }])
            setCurrentOriginal('')
            pendingOriginalRef.current = ''
          } else if (event.brainId === challengerId) {
            const answer = event.response.text || challengerBuffer
            const latency =
              Date.now() -
              (startTimesRef.current.get(challengerId) ?? Date.now())
            challengerResult = {
              brainId: challengerId,
              text: answer,
              inputTokens: event.response.inputTokens,
              outputTokens: event.response.outputTokens,
              latencyMs: latency
            }
            setChallengerStats(challengerResult)
            setChallengerTurns((prev) => [...prev, { question, answer }])
            setCurrentChallenger('')
            pendingChallengerRef.current = ''
          }
        }

        if (event.type === 'all_complete' && originalResult) {
          addHistoryEntry({
            id: entryId,
            createdAt,
            question,
            original: originalResult,
            challenger: challengerResult,
            intent: intentResult
          })
        }

        if (event.type === 'error') {
          setError(event.error.message)
        }
      }
    } catch (err) {
      setError((err as Error).message ?? 'Unknown error')
    } finally {
      setIsThinking(false)
      runningRef.current = false
      abortRef.current = null
    }
  }, [challengerId, engine, input, originalId, session])

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') {
      if (isThinking && abortRef.current) {
        abortRef.current.abort()
        return
      }
      process.exit(0)
    }

    if (key.return) {
      void submit()
      return
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1))
      return
    }

    if (inputChar) {
      setInput((prev) => prev + inputChar)
    }
  })

  const showChallenger = Boolean(challengerId && (intent?.shouldMirror ?? true))
  const formatText = useCallback(
    (text: string) => (syntaxHighlighting ? highlightCodeBlocks(text) : text),
    [syntaxHighlighting]
  )
  const statusSegments: string[] = []
  statusSegments.push(isThinking ? 'Thinking...' : 'Ready')

  if (showTokenCounts && originalStats) {
    const origTokens = formatTokens(
      originalStats.inputTokens,
      originalStats.outputTokens
    )
    if (origTokens) {
      statusSegments.push(`orig ${origTokens}`)
    }
  }

  if (showTokenCounts && challengerStats && showChallenger) {
    const chalTokens = formatTokens(
      challengerStats.inputTokens,
      challengerStats.outputTokens
    )
    if (chalTokens) {
      statusSegments.push(`chal ${chalTokens}`)
    }
  }

  if (showLatency && originalStats?.latencyMs !== undefined) {
    statusSegments.push(`orig ${originalStats.latencyMs}ms`)
  }

  if (showLatency && challengerStats?.latencyMs !== undefined && showChallenger) {
    statusSegments.push(`chal ${challengerStats.latencyMs}ms`)
  }

  statusSegments.push(`${originalTurns.length} turns`)
  statusSegments.push('Enter to submit, Ctrl+C to exit')
  const statusText = statusSegments.join(' | ')

  const originalRendered = useMemo(
    () =>
      originalTurns.map((turn, index) => (
        <Box key={`orig-${index}`} flexDirection="column" marginTop={1}>
          <Text color="cyan">Q: {turn.question}</Text>
          <Text>A: {formatText(turn.answer)}</Text>
        </Box>
      )),
    [originalTurns, formatText]
  )

  const challengerRendered = useMemo(
    () =>
      challengerTurns.map((turn, index) => (
        <Box key={`chal-${index}`} flexDirection="column" marginTop={1}>
          <Text color="cyan">Q: {turn.question}</Text>
          <Text>A: {formatText(turn.answer)}</Text>
        </Box>
      )),
    [challengerTurns, formatText]
  )

  const showSideBySide = showChallenger && columns >= 80
  const panelGap = showSideBySide ? 1 : 0
  const panelWidth = showSideBySide
    ? Math.floor((columns - panelGap) / 2)
    : undefined
  const effectiveLayout = showSideBySide ? 'side-by-side' : 'stacked'

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        {headerLines.map((line, index) => (
          <React.Fragment key={`header-${index}`}>
            {index === headerLines.length - 1
              ? renderMutedLine(line)
              : renderGradientLine(line, true)}
          </React.Fragment>
        ))}
      </Box>
      {intent && (
        <Box marginTop={1}>
          <IntentBadge category={intent.category} mirrored={intent.shouldMirror} />
          <Text> ({Math.round(intent.confidence * 100)}%)</Text>
        </Box>
      )}
      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <ChatLayout layout={effectiveLayout} breakpoint={80}>
          <BrainPanel
            title={`ORIGINAL  ${originalId}`}
            width={panelWidth}
            marginRight={showSideBySide ? 1 : 0}
          >
            {originalRendered}
            {isThinking && currentOriginal && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="cyan">Q: {activeQuestion}</Text>
                <StreamingText value={`A: ${currentOriginal}`} dim />
              </Box>
            )}
          </BrainPanel>
          {showChallenger && (
            <BrainPanel title={`CHALLENGER  ${challengerId}`} width={panelWidth}>
              {challengerRendered}
              {isThinking && currentChallenger && (
                <Box flexDirection="column" marginTop={1}>
                  <Text color="cyan">Q: {activeQuestion}</Text>
                  <StreamingText value={`A: ${currentChallenger}`} dim />
                </Box>
              )}
            </BrainPanel>
          )}
        </ChatLayout>
      </Box>
      <Box marginTop={1}>
        <StatusBar text={statusText} />
      </Box>
      <Text>{`> ${input}`}</Text>
    </Box>
  )
}

function formatTokens(
  inputTokens?: number,
  outputTokens?: number
): string | null {
  if (inputTokens === undefined && outputTokens === undefined) {
    return null
  }
  const input = inputTokens ?? 0
  const output = outputTokens ?? 0
  return `${input}/${output} tok`
}

function loadHeaderArt(): string[] {
  const cwd = process.cwd()
  const candidateFiles = [
    resolve(cwd, 'src', 'ui', 'header.txt'),
    resolve(cwd, 'src', 'ui', 'hEADER.txt'),
    resolve(cwd, 'header.txt'),
    resolve(cwd, 'hEADER.txt')
  ]

  for (const filename of candidateFiles) {
    if (!existsSync(filename)) {
      continue
    }
    try {
      const contents = readFileSync(filename, 'utf8')
      return cleanHeaderLines(contents)
    } catch {
      continue
    }
  }

  const moduleCandidates = ['header.txt', 'hEADER.txt']
  for (const filename of moduleCandidates) {
    try {
      const headerPath = fileURLToPath(new URL(`./${filename}`, import.meta.url))
      if (!existsSync(headerPath)) {
        continue
      }
      const contents = readFileSync(headerPath, 'utf8')
      return cleanHeaderLines(contents)
    } catch {
      continue
    }
  }

  return []
}

function cleanHeaderLines(contents: string): string[] {
  const lines = contents.split(/\r?\n/)
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }
  return lines
}

function fitHeaderArt(lines: string[], columns: number): string[] {
  if (lines.length === 0 || columns <= 0) {
    return []
  }

  const trimmed = lines.map((line) => line.replace(/\s+$/, ''))
  const nonEmpty = trimmed.filter((line) => line.trim().length > 0)
  const minIndent =
    nonEmpty.length > 0
      ? Math.min(...nonEmpty.map((line) => line.match(/^\s*/)?.[0].length ?? 0))
      : 0
  const aligned =
    minIndent > 0 ? trimmed.map((line) => line.slice(minIndent)) : trimmed
  const maxWidth =
    aligned.length > 0 ? Math.max(...aligned.map((line) => line.length)) : 0

  if (maxWidth === 0) {
    return []
  }

  if (maxWidth <= columns) {
    return aligned
  }

  const targetWidth = Math.max(1, Math.min(columns, maxWidth))
  return aligned.map((line) => line.slice(0, targetWidth))
}

function fitLineToColumns(line: string, columns: number): string {
  if (columns <= 0) {
    return ''
  }
  if (line.length <= columns) {
    return line
  }
  return line.slice(0, columns)
}

function renderMutedLine(line: string): JSX.Element {
  return (
    <Text color="gray" wrap="truncate">
      {line}
    </Text>
  )
}

const HEADER_GRADIENT_STOPS = [
  '#00D2FF',
  '#3A7BD5',
  '#7F5AF0',
  '#FF6EC7',
  '#FFB86C'
]

function renderGradientLine(line: string, bold = false): JSX.Element {
  if (line.length === 0) {
    return (
      <Text bold={bold} wrap="truncate">
        {line}
      </Text>
    )
  }

  const chars = Array.from(line)
  const lastIndex = Math.max(chars.length - 1, 1)

  return (
    <Text bold={bold} wrap="truncate">
      {chars.map((char, index) => (
        <Text key={`char-${index}`} color={gradientColorAt(index / lastIndex)}>
          {char}
        </Text>
      ))}
    </Text>
  )
}

function gradientColorAt(position: number): string {
  const clamped = Math.max(0, Math.min(1, position))
  const steps = HEADER_GRADIENT_STOPS.length - 1
  const scaled = clamped * steps
  const index = Math.min(Math.floor(scaled), steps - 1)
  const local = scaled - index
  const from = hexToRgb(HEADER_GRADIENT_STOPS[index])
  const to = hexToRgb(HEADER_GRADIENT_STOPS[index + 1])

  const red = Math.round(lerp(from.r, to.r, local))
  const green = Math.round(lerp(from.g, to.g, local))
  const blue = Math.round(lerp(from.b, to.b, local))

  return rgbToHex(red, green, blue)
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized
        .split('')
        .map((char) => char + char)
        .join('')
    : normalized
  const int = Number.parseInt(value, 16)
  return {
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
}
