import { randomUUID } from 'node:crypto'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Text, useInput } from 'ink'
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
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setPulse((prev) => !prev), 450)
    return () => clearInterval(timer)
  }, [])

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
            setCurrentOriginal(originalBuffer)
          } else if (event.brainId === challengerId) {
            challengerBuffer += event.chunk.delta
            setCurrentChallenger(challengerBuffer)
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

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        <Text bold color="cyan">
          ADVERSARIAL MIRROR
        </Text>
        <Box>
          <Text color="green">ORIGINAL</Text>
          <Text color={pulse ? 'red' : 'yellow'}>{'  << VS >>  '}</Text>
          <Text color="magenta">CHALLENGER</Text>
        </Box>
        <Text color="gray">
          DUEL MODE | Intensity: {intensity.toUpperCase()}
        </Text>
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
        <ChatLayout layout={layout}>
          <BrainPanel title={`ORIGINAL  ${originalId}`}>
            {originalTurns.map((turn, index) => (
              <Box key={`orig-${index}`} flexDirection="column" marginTop={1}>
                <Text color="cyan">Q: {turn.question}</Text>
                <Text>A: {formatText(turn.answer)}</Text>
              </Box>
            ))}
            {isThinking && currentOriginal && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="cyan">Q: {activeQuestion}</Text>
                <StreamingText value={`A: ${currentOriginal}`} dim />
              </Box>
            )}
          </BrainPanel>
          {showChallenger && (
            <BrainPanel title={`CHALLENGER  ${challengerId}`}>
              {challengerTurns.map((turn, index) => (
                <Box key={`chal-${index}`} flexDirection="column" marginTop={1}>
                  <Text color="cyan">Q: {turn.question}</Text>
                  <Text>A: {formatText(turn.answer)}</Text>
                </Box>
              ))}
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
