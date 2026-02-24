import { randomUUID } from 'node:crypto'
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

  const headerLines =
    columns >= 90
      ? [
          '    _      __  __ ___ ____  ____   ___   ____  ',
          '   / \\     |  \\/  |_ _|  _ \\|  _ \\ / _ \\ / ___| ',
          '  / _ \\    | |\\/| || || |_) | |_) | | | | |     ',
          ' / ___ \\   | |  | || ||  _ <|  _ <| |_| | |___  ',
          '/_/   \\_\\  |_|  |_|___|_| \\_\\_| \\_\\\\___/ \\____| ',
          `                A-MIRROR | Intensity: ${intensity.toUpperCase()}`
        ]
      : ['A-MIRROR', `Intensity: ${intensity.toUpperCase()}`]

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

  const showSideBySide = showChallenger && columns >= 100
  const panelGap = showSideBySide ? 1 : 0
  const panelWidth = showSideBySide
    ? Math.floor((columns - panelGap) / 2)
    : undefined
  const effectiveLayout = showSideBySide ? 'side-by-side' : 'stacked'

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        {headerLines.map((line, index) => (
          <Text key={`header-${index}`} bold={index === 0}>
            {index === headerLines.length - 1
              ? renderMutedLine(line)
              : renderGradientLine(line, index)}
          </Text>
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
        <ChatLayout layout={effectiveLayout} breakpoint={100}>
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

function renderGradientLine(line: string, index: number): JSX.Element {
  const palette: Array<React.ComponentProps<typeof Text>['color']> = [
    'cyan',
    'blue',
    'magenta',
    'green',
    'cyan'
  ]
  const color = palette[index % palette.length]
  return <Text color={color}>{line}</Text>
}

function renderMutedLine(line: string): JSX.Element {
  return <Text color="gray">{line}</Text>
}
