import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Static, Text, useInput, useStdout } from 'ink'
import type { BrainResult, IntentResult } from '../types/index.js'
import type { MirrorEngine } from '../engine/mirror-engine.js'
import { Session } from '../engine/session.js'
import { addHistoryEntry } from '../history/store.js'
import { BrainPanel } from './components/BrainPanel.js'
import { IntentBadge } from './components/IntentBadge.js'
import { StreamingText } from './components/StreamingText.js'
import { highlightCodeBlocks } from './utils/highlight.js'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CompletedExchange {
  id: string
  question: string
  intent?: IntentResult
  original: string
  challenger?: string
  isMirrored: boolean
  /** Terminal width captured at completion time — frozen so Static renders at the right width. */
  columns: number
}

type StaticItem =
  | { kind: 'header'; id: 'header'; lines: string[]; originalId: string; challengerId?: string; intensity: string }
  | { kind: 'exchange'; id: string; exchange: CompletedExchange; originalId: string; challengerId?: string }

export interface MirrorAppProps {
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

// ── Gradient helpers ───────────────────────────────────────────────────────────

const GRAD = ['#00D2FF', '#3A7BD5', '#7F5AF0', '#FF6EC7', '#FFB86C']

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = hex.replace('#', '')
  const v = parseInt(n.length === 3 ? n.split('').map(c => c + c).join('') : n, 16)
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff }
}

function gradColor(pos: number): string {
  const p = Math.max(0, Math.min(1, pos))
  const steps = GRAD.length - 1
  const scaled = p * steps
  const i = Math.min(Math.floor(scaled), steps - 1)
  const t = scaled - i
  const a = hexToRgb(GRAD[i])
  const b = hexToRgb(GRAD[i + 1])
  const r = Math.round(a.r + (b.r - a.r) * t)
  const g = Math.round(a.g + (b.g - a.g) * t)
  const bv = Math.round(a.b + (b.b - a.b) * t)
  return `#${[r, g, bv].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function GradientLine({ line, bold }: { line: string; bold?: boolean }): JSX.Element {
  if (!line.trim()) return <Text> </Text>
  const chars = Array.from(line)
  const last = Math.max(chars.length - 1, 1)
  return (
    <Text bold={bold} wrap="truncate">
      {chars.map((ch, idx) => (
        <Text key={idx} color={gradColor(idx / last)}>{ch}</Text>
      ))}
    </Text>
  )
}

// ── Static sub-components (rendered once, never re-rendered) ───────────────────

function HeaderView({
  lines, originalId, challengerId, intensity
}: {
  lines: string[]; originalId: string; challengerId?: string; intensity: string
}): JSX.Element {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {lines.map((line, i) =>
        i < lines.length - 1
          ? <GradientLine key={i} line={line} bold />
          : <Text key={i} color="gray" wrap="truncate">{line}</Text>
      )}
      <Text color="gray" dimColor>
        {'  '}{originalId}{challengerId ? ` vs ${challengerId}` : '  [direct mode]'}{'  '}[{intensity}]
      </Text>
    </Box>
  )
}

function ExchangeView({
  exchange, originalId, challengerId
}: {
  exchange: CompletedExchange; originalId: string; challengerId?: string
}): JSX.Element {
  const sideBySide = exchange.isMirrored && Boolean(exchange.challenger) && exchange.columns >= 80
  const panelWidth = sideBySide ? Math.floor((exchange.columns - 1) / 2) : undefined

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>
        <Text color="cyan">You: </Text>
        <Text>{exchange.question}</Text>
      </Text>
      {exchange.intent && (
        <Box>
          <IntentBadge category={exchange.intent.category} mirrored={exchange.intent.shouldMirror} />
          <Text color="gray"> {Math.round(exchange.intent.confidence * 100)}%</Text>
        </Box>
      )}
      <Box marginTop={1} flexDirection={sideBySide ? 'row' : 'column'}>
        <BrainPanel
          title={`ORIGINAL  ${originalId}`}
          flex={!sideBySide}
          width={panelWidth}
          marginRight={sideBySide ? 1 : 0}
        >
          <Text wrap="wrap">{exchange.original}</Text>
        </BrainPanel>
        {exchange.isMirrored && exchange.challenger && (
          <BrainPanel
            title={`CHALLENGER  ${challengerId}`}
            flex={!sideBySide}
            width={panelWidth}
          >
            <Text wrap="wrap">{exchange.challenger}</Text>
          </BrainPanel>
        )}
      </Box>
    </Box>
  )
}

// ── Header file loading ────────────────────────────────────────────────────────

function loadRawHeaderLines(): string[] {
  const cwd = process.cwd()
  const candidates = [
    resolve(cwd, 'src', 'ui', 'header.txt'),
    resolve(cwd, 'header.txt'),
  ]
  for (const f of candidates) {
    if (!existsSync(f)) continue
    try {
      const lines = readFileSync(f, 'utf8').split(/\r?\n/)
      while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop()
      return lines
    } catch { continue }
  }
  try {
    const p = fileURLToPath(new URL('./header.txt', import.meta.url))
    if (existsSync(p)) {
      const lines = readFileSync(p, 'utf8').split(/\r?\n/)
      while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop()
      return lines
    }
  } catch { /* no header file bundled */ }
  return []
}

function fitLines(lines: string[], cols: number): string[] {
  if (!lines.length || cols <= 0) return []
  const trimmed = lines.map(l => l.replace(/\s+$/, ''))
  const nonEmpty = trimmed.filter(l => l.trim().length > 0)
  const indent = nonEmpty.length
    ? Math.min(...nonEmpty.map(l => l.match(/^\s*/)?.[0].length ?? 0))
    : 0
  const aligned = indent > 0 ? trimmed.map(l => l.slice(indent)) : trimmed
  return aligned.map(l => (l.length > cols ? l.slice(0, cols) : l))
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function formatTokens(input?: number, output?: number): string | null {
  if (input === undefined && output === undefined) return null
  return `${input ?? 0}/${output ?? 0}tok`
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MirrorApp({
  engine,
  session,
  originalId,
  challengerId,
  intensity,
  showTokenCounts = false,
  showLatency = true,
  syntaxHighlighting = true,
}: MirrorAppProps): JSX.Element {
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 120

  // Build and freeze the header item on first render — captured once, never changes
  const initialStaticItems = useMemo<StaticItem[]>(() => {
    const raw = loadRawHeaderLines()
    const lines = fitLines(raw, Math.max(1, columns - 1))
    return [{ kind: 'header', id: 'header', lines, originalId, challengerId, intensity }]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — header is frozen at mount

  const [completedItems, setCompletedItems] = useState<Array<StaticItem & { kind: 'exchange' }>>([])

  // Static receives: [header, ...completed exchanges]
  // Items can only be appended — Ink renders new ones and stamps them permanently above
  const allStaticItems = useMemo<StaticItem[]>(
    () => [...initialStaticItems, ...completedItems],
    [initialStaticItems, completedItems]
  )

  // ── Dynamic UI state ─────────────────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [activeQuestion, setActiveQuestion] = useState('')
  const [currentOriginal, setCurrentOriginal] = useState('')
  const [currentChallenger, setCurrentChallenger] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [isClassifying, setIsClassifying] = useState(false)
  const [intent, setIntent] = useState<IntentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [originalStats, setOriginalStats] = useState<BrainResult | null>(null)
  const [challengerStats, setChallengerStats] = useState<BrainResult | null>(null)
  const [turnCount, setTurnCount] = useState(0)

  // ── Refs (not reactive — avoid triggering re-renders) ────────────────────────
  const runningRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const pendingOrigRef = useRef('')
  const pendingChalRef = useRef('')
  const startTimesRef = useRef(new Map<string, number>())
  const columnsRef = useRef(columns)

  useEffect(() => { columnsRef.current = columns }, [columns])

  // Batch streaming text updates at 60 ms — prevents a re-render on every token
  useEffect(() => {
    const id = setInterval(() => {
      setCurrentOriginal(pendingOrigRef.current)
      setCurrentChallenger(pendingChalRef.current)
    }, 60)
    return () => clearInterval(id)
  }, [])

  // ── Layout ───────────────────────────────────────────────────────────────────
  const showChallengerPanel = Boolean(challengerId) && (intent?.shouldMirror ?? true)
  const showSideBySide = showChallengerPanel && columns >= 80
  const panelWidth = showSideBySide ? Math.floor((columns - 1) / 2) : undefined

  const formatText = useCallback(
    (text: string) => (syntaxHighlighting ? highlightCodeBlocks(text) : text),
    [syntaxHighlighting]
  )

  // ── Submit ───────────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (runningRef.current) return
    const question = input.trim()
    if (!question) return

    runningRef.current = true
    setInput('')
    setError(null)
    setIntent(null)
    setActiveQuestion(question)
    setIsThinking(true)
    setIsClassifying(false)
    setOriginalStats(null)
    setChallengerStats(null)
    pendingOrigRef.current = ''
    pendingChalRef.current = ''
    setCurrentOriginal('')
    setCurrentChallenger('')

    const history = session.getHistory()
    session.addUser(question)

    let originalBuffer = ''
    let challengerBuffer = ''
    let originalResult: BrainResult | null = null
    let challengerResult: BrainResult | undefined
    let intentResult: IntentResult | undefined
    let isMirrored = Boolean(challengerId)

    const entryId = randomUUID()
    const createdAt = new Date().toISOString()
    const controller = new AbortController()
    abortRef.current = controller

    startTimesRef.current = new Map<string, number>([
      [originalId, Date.now()],
      ...(challengerId ? [[challengerId, Date.now()] as [string, number]] : []),
    ])

    try {
      for await (const event of engine.run(question, history, { signal: controller.signal })) {
        if (event.type === 'classifying') {
          setIsClassifying(true)
        }

        if (event.type === 'classified') {
          setIsClassifying(false)
          setIntent(event.result)
          intentResult = event.result
          isMirrored = event.result.shouldMirror && Boolean(challengerId)
        }

        if (event.type === 'stream_chunk') {
          if (event.brainId === originalId) {
            originalBuffer += event.chunk.delta
            pendingOrigRef.current = originalBuffer
          } else if (event.brainId === challengerId) {
            challengerBuffer += event.chunk.delta
            pendingChalRef.current = challengerBuffer
          }
        }

        if (event.type === 'brain_complete') {
          const latency = Date.now() - (startTimesRef.current.get(event.brainId) ?? Date.now())
          if (event.brainId === originalId) {
            const text = event.response.text || originalBuffer
            originalResult = {
              brainId: originalId,
              text,
              inputTokens: event.response.inputTokens,
              outputTokens: event.response.outputTokens,
              latencyMs: latency,
            }
            setOriginalStats(originalResult)
            session.addAssistant(text)
          } else if (event.brainId === challengerId) {
            const text = event.response.text || challengerBuffer
            challengerResult = {
              brainId: challengerId!,
              text,
              inputTokens: event.response.inputTokens,
              outputTokens: event.response.outputTokens,
              latencyMs: latency,
            }
            setChallengerStats(challengerResult)
          }
        }

        if (event.type === 'all_complete' && originalResult) {
          addHistoryEntry({
            id: entryId,
            createdAt,
            question,
            original: originalResult,
            challenger: challengerResult,
            intent: intentResult,
          })

          // Capture terminal width at completion time — Static renders with this width forever
          const cols = columnsRef.current
          const exchange: CompletedExchange = {
            id: entryId,
            question,
            intent: intentResult,
            original: formatText(originalResult.text),
            challenger: challengerResult ? formatText(challengerResult.text) : undefined,
            isMirrored,
            columns: cols,
          }

          setCompletedItems(prev => [
            ...prev,
            { kind: 'exchange', id: entryId, exchange, originalId, challengerId },
          ])
          setTurnCount(prev => prev + 1)

          // Clear the streaming area — Static will show the completed exchange
          setActiveQuestion('')
          pendingOrigRef.current = ''
          pendingChalRef.current = ''
          setCurrentOriginal('')
          setCurrentChallenger('')
        }

        if (event.type === 'error') {
          setError(event.error.message)
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message ?? 'Unknown error')
      }
    } finally {
      setIsThinking(false)
      setIsClassifying(false)
      runningRef.current = false
      abortRef.current = null
    }
  }, [challengerId, engine, formatText, input, originalId, session])

  // ── Input handling ───────────────────────────────────────────────────────────
  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') {
      if (isThinking && abortRef.current) {
        abortRef.current.abort()
        return
      }
      process.exit(0)
    }
    if (key.return) { void submit(); return }
    if (key.backspace || key.delete) { setInput(p => p.slice(0, -1)); return }
    if (ch && !key.ctrl && !key.meta) setInput(p => p + ch)
  })

  // ── Status bar ───────────────────────────────────────────────────────────────
  const statusParts: string[] = []
  if (isClassifying) statusParts.push('Classifying...')
  else if (isThinking) statusParts.push('Thinking...')
  else statusParts.push('Ready')

  if (showTokenCounts) {
    const origT = formatTokens(originalStats?.inputTokens, originalStats?.outputTokens)
    if (origT) statusParts.push(`orig ${origT}`)
    if (challengerStats) {
      const chalT = formatTokens(challengerStats.inputTokens, challengerStats.outputTokens)
      if (chalT) statusParts.push(`chal ${chalT}`)
    }
  }
  if (showLatency && originalStats?.latencyMs != null) {
    statusParts.push(`orig ${(originalStats.latencyMs / 1000).toFixed(1)}s`)
  }
  if (showLatency && challengerStats?.latencyMs != null) {
    statusParts.push(`chal ${(challengerStats.latencyMs / 1000).toFixed(1)}s`)
  }
  statusParts.push(`${turnCount} turn${turnCount !== 1 ? 's' : ''}`)
  statusParts.push('Ctrl+C to exit')

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column">

      {/*
       * Static renders each item ONCE and stamps it into the terminal scroll
       * buffer permanently — just like normal terminal output. This means:
       *   - History never redraws or flickers
       *   - The terminal resizes gracefully (completed turns don't move)
       *   - Ink's dynamic area stays small (only streaming panels + input)
       */}
      <Static items={allStaticItems}>
        {(item) => {
          if (item.kind === 'header') {
            return (
              <HeaderView
                key="header"
                lines={item.lines}
                originalId={item.originalId}
                challengerId={item.challengerId}
                intensity={item.intensity}
              />
            )
          }
          return (
            <ExchangeView
              key={item.id}
              exchange={item.exchange}
              originalId={item.originalId}
              challengerId={item.challengerId}
            />
          )
        }}
      </Static>

      {/* In-progress streaming — only present while a query is running */}
      {isThinking && activeQuestion && (
        <Box flexDirection="column">
          <Text bold>
            <Text color="cyan">You: </Text>
            <Text>{activeQuestion}</Text>
          </Text>

          {intent ? (
            <Box>
              <IntentBadge category={intent.category} mirrored={intent.shouldMirror} />
              <Text color="gray"> {Math.round(intent.confidence * 100)}%</Text>
            </Box>
          ) : isClassifying ? (
            <Text color="gray" dimColor>Classifying...</Text>
          ) : null}

          <Box marginTop={1} flexDirection={showSideBySide ? 'row' : 'column'}>
            <BrainPanel
              title={`ORIGINAL  ${originalId}`}
              flex={!showSideBySide}
              width={panelWidth}
              marginRight={showSideBySide && showChallengerPanel ? 1 : 0}
            >
              <StreamingText value={currentOriginal} />
            </BrainPanel>

            {showChallengerPanel && (
              <BrainPanel
                title={`CHALLENGER  ${challengerId}  [${intensity}]`}
                flex={!showSideBySide}
                width={panelWidth}
              >
                <StreamingText value={currentChallenger} />
              </BrainPanel>
            )}
          </Box>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Status */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>{statusParts.join(' · ')}</Text>
      </Box>

      {/* Input prompt */}
      <Box>
        <Text color="cyan" bold>{'> '}</Text>
        <Text>{input}</Text>
        <Text color={isThinking ? 'gray' : 'cyan'}>█</Text>
      </Box>

    </Box>
  )
}
