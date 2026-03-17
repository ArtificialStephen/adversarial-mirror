import { randomUUID } from 'node:crypto'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Static, Text, useInput, useStdout } from 'ink'
import type { BrainResult, IntentResult, SynthesisResult } from '../types/index.js'
import type { MirrorEngine } from '../engine/mirror-engine.js'
import { Session } from '../engine/session.js'
import { addHistoryEntry, listHistory } from '../history/store.js'
import { BrainPanel } from './components/BrainPanel.js'
import { IntentBadge } from './components/IntentBadge.js'
import { StreamingText } from './components/StreamingText.js'
import { highlightCodeBlocks } from './utils/highlight.js'

// ── Theme ──────────────────────────────────────────────────────────────────────

const THEME = {
  original:   '#89b4fa',  // pastel blue
  challenger: '#cba6f7',  // pastel lavender
  synthesis:  '#f9e2af',  // pastel amber
  input:      '#89dceb',  // pastel sky
  ready:      '#a6e3a1',  // pastel green
  thinking:   '#74c7ec',  // pastel sapphire
  error:      '#f38ba8',  // pastel rose
  dim:        '#6c7086',  // muted gray
} as const

// ── Types ──────────────────────────────────────────────────────────────────────

interface CompletedExchange {
  id: string
  question: string
  intent?: IntentResult
  original: string
  challenger?: string
  synthesis?: string
  agreementScore?: number
  isMirrored: boolean
}

type StaticItem =
  | { type: 'header'; id: 'header'; originalId: string; challengerId?: string; judgerId?: string; intensity: string; persona?: string }
  | { type: 'exchange'; id: string; exchange: CompletedExchange; originalId: string; challengerId?: string; columns: number }

export interface MirrorAppProps {
  engine: MirrorEngine
  session: Session
  originalId: string
  challengerId?: string
  judgerId?: string
  intensity: string
  persona?: string
  layout?: 'side-by-side' | 'stacked'
  showTokenCounts?: boolean
  showLatency?: boolean
  syntaxHighlighting?: boolean
}

// ── Gradient helpers ───────────────────────────────────────────────────────────

const GRAD = ['#89dceb', '#89b4fa', '#cba6f7', '#f5c2e7', '#f9e2af']

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

function GradientText({ text, bold }: { text: string; bold?: boolean }): JSX.Element {
  const chars = Array.from(text)
  const last = Math.max(chars.length - 1, 1)
  return (
    <Text bold={bold} wrap="truncate">
      {chars.map((ch, idx) => (
        <Text key={idx} color={gradColor(idx / last)}>{ch}</Text>
      ))}
    </Text>
  )
}

// ── Score bar ──────────────────────────────────────────────────────────────────

function scoreBar(score: number, barWidth = 10): string {
  const filled = Math.round((score / 100) * barWidth)
  return '█'.repeat(filled) + '░'.repeat(barWidth - filled)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const HeaderView = React.memo(function HeaderView({
  originalId, challengerId, judgerId, intensity, persona
}: {
  originalId: string
  challengerId?: string
  judgerId?: string
  intensity: string
  persona?: string
}): JSX.Element {
  const modeText = challengerId
    ? `${originalId}  ⇄  ${challengerId}`
    : `${originalId}  [direct]`
  const parts = [modeText, intensity]
  if (judgerId) parts.push(`judge: ${judgerId}`)
  if (persona) parts.push(persona)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={THEME.input}
      paddingX={1}
      marginBottom={1}
    >
      <Box>
        <Text bold color={THEME.input}>✦  </Text>
        <GradientText text="ADVERSARIAL MIRROR" bold />
      </Box>
      <Text color={THEME.dim}>{parts.join('  ·  ')}</Text>
      <Text color={THEME.dim} dimColor>{'↑↓ history  ctrl+r re-run  /clear reset  ctrl+c exit'}</Text>
    </Box>
  )
})

function stripAgreementHeader(text: string): string {
  return text.replace(/^AGREEMENT:\s*-?\d+%[^\n]*\n?\n?/i, '').trimStart()
}

const ExchangeView = React.memo(function ExchangeView({
  exchange, originalId, challengerId, columns
}: {
  exchange: CompletedExchange
  originalId: string
  challengerId?: string
  columns: number
}): JSX.Element {
  const sideBySide = exchange.isMirrored && Boolean(exchange.challenger) && columns >= 80
  const panelWidth = sideBySide ? Math.floor((columns - 1) / 2) : columns

  const scoreLabel = exchange.agreementScore !== undefined
    ? `  ${scoreBar(exchange.agreementScore)}  ${exchange.agreementScore}%`
    : ''

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>
        <Text color={THEME.input}>❯ </Text>
        <Text>{exchange.question}</Text>
      </Text>
      {exchange.intent && (
        <Box marginTop={0}>
          <IntentBadge
            category={exchange.intent.category}
            mirrored={exchange.intent.shouldMirror}
            confidence={exchange.intent.confidence}
          />
        </Box>
      )}
      <Box marginTop={1} flexDirection={sideBySide ? 'row' : 'column'}>
        <BrainPanel
          title={`ORIGINAL  ${originalId}`}
          width={panelWidth}
          marginRight={sideBySide ? 1 : 0}
          titleColor={THEME.original}
        >
          <Text wrap="wrap">{exchange.original}</Text>
        </BrainPanel>
        {exchange.isMirrored && exchange.challenger && (
          <BrainPanel
            title={`CHALLENGER  ${challengerId}`}
            width={panelWidth}
            titleColor={THEME.challenger}
          >
            <Text wrap="wrap">{exchange.challenger}</Text>
          </BrainPanel>
        )}
      </Box>
      {exchange.synthesis && (
        <Box marginTop={1}>
          <BrainPanel
            title={`SYNTHESIS${scoreLabel}`}
            width={columns}
            borderColor={THEME.synthesis}
            borderStyle="bold"
          >
            <Text wrap="wrap">{stripAgreementHeader(exchange.synthesis)}</Text>
          </BrainPanel>
        </Box>
      )}
    </Box>
  )
})

// For live streaming panels: tail to maxLines AND truncate each line to maxWidth
// so Ink never wraps, keeping the dynamic area height exactly predictable.
// maxWidth = panelWidth - 5: border(2) + padding(2) + 1 col for cursor ▌.
function liveLines(text: string, maxLines: number, maxWidth: number): string {
  if (maxLines <= 0 || !text) return ''
  const lines = text.split(/\r?\n/)
  const tail = lines.length > maxLines ? lines.slice(-maxLines) : lines
  return tail.map(l => l.length > maxWidth ? l.slice(0, maxWidth) : l).join('\n')
}

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
  judgerId,
  intensity,
  persona,
  showTokenCounts = false,
  showLatency = true,
  syntaxHighlighting = true,
}: MirrorAppProps): JSX.Element {
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 120
  const rows = stdout?.rows ?? 40

  // ── Static content (header + completed exchanges) ─────────────────────────────
  const [staticItems, setStaticItems] = useState<StaticItem[]>([
    { type: 'header', id: 'header', originalId, challengerId, judgerId, intensity, persona }
  ])

  // ── Dynamic UI state ──────────────────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [activeQuestion, setActiveQuestion] = useState('')
  const [currentOriginal, setCurrentOriginal] = useState('')
  const [currentChallenger, setCurrentChallenger] = useState('')
  const [currentSynthesis, setCurrentSynthesis] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [isClassifying, setIsClassifying] = useState(false)
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [intent, setIntent] = useState<IntentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [originalStats, setOriginalStats] = useState<BrainResult | null>(null)
  const [challengerStats, setChallengerStats] = useState<BrainResult | null>(null)
  const [synthesisStats, setSynthesisStats] = useState<SynthesisResult | null>(null)
  const [turnCount, setTurnCount] = useState(0)
  const [commitTick, setCommitTick] = useState(0)

  const [originalHasContent, setOriginalHasContent] = useState(false)
  const [challengerHasContent, setChallengerHasContent] = useState(false)
  const [synthesisHasContent, setSynthesisHasContent] = useState(false)

  const [historyNavIndex, setHistoryNavIndex] = useState(-1)
  const [inputSnapshot, setInputSnapshot] = useState('')
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const runningRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const pendingOrigRef = useRef('')
  const pendingChalRef = useRef('')
  const pendingSynthRef = useRef('')
  const pendingExchangeRef = useRef<StaticItem | null>(null)
  const startTimesRef = useRef(new Map<string, number>())
  const lastChunkTimesRef = useRef(new Map<string, number>())
  const columnsRef = useRef(columns)
  const lastQuestionRef = useRef('')
  const origHasContentRef = useRef(false)
  const chalHasContentRef = useRef(false)
  const synthHasContentRef = useRef(false)

  useEffect(() => { columnsRef.current = columns }, [columns])

  // Defer Static writes until after streaming panels are cleared.
  useEffect(() => {
    if (isThinking) return
    if (!pendingExchangeRef.current) return
    setCommitTick(tick => tick + 1)
  }, [isThinking])

  useEffect(() => {
    if (!pendingExchangeRef.current) return
    const item = pendingExchangeRef.current
    pendingExchangeRef.current = null
    setStaticItems(prev => [...prev, item])
  }, [commitTick])

  // Single spinner interval — shared by all StreamingText components.
  const [spinnerFrame, setSpinnerFrame] = useState(0)

  // Batch streaming state at 60ms to avoid per-token re-renders.
  useEffect(() => {
    const id = setInterval(() => {
      setCurrentOriginal(pendingOrigRef.current)
      setCurrentChallenger(pendingChalRef.current)
      setCurrentSynthesis(pendingSynthRef.current)
      setSpinnerFrame(f => (f + 1) % 10)
    }, 60)
    return () => clearInterval(id)
  }, [])

  // ── Layout ────────────────────────────────────────────────────────────────────
  const showChallengerPanel = Boolean(challengerId) && (intent?.shouldMirror ?? true)
  const showSideBySide = showChallengerPanel && columns >= 80
  const panelWidth = showSideBySide ? Math.floor((columns - 1) / 2) : columns

  const hasSynthesisPanel = isSynthesizing || Boolean(currentSynthesis)
  const panelGroupCount =
    (showSideBySide || !showChallengerPanel ? 1 : 2) +
    (hasSynthesisPanel ? 1 : 0)
  const fixedChrome = hasSynthesisPanel ? 7 : 6
  const liveLineLimit = Math.max(
    1,
    Math.min(16, Math.floor((rows - fixedChrome - 3) / panelGroupCount) - 5)
  )

  const formatText = useCallback(
    (text: string) => (syntaxHighlighting ? highlightCodeBlocks(text) : text),
    [syntaxHighlighting]
  )

  // ── Submit ────────────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (runningRef.current) return
    const question = input.trim()
    if (!question) return

    if (question === '/clear') {
      setInput('')
      session.clear()
      setTurnCount(0)
      setSessionMessage('session cleared')
      setTimeout(() => setSessionMessage(null), 2000)
      return
    }

    runningRef.current = true
    lastQuestionRef.current = question
    setInput('')
    setError(null)
    setIntent(null)
    setActiveQuestion(question)
    setIsThinking(true)
    setIsClassifying(false)
    setIsSynthesizing(false)
    setOriginalStats(null)
    setChallengerStats(null)
    setSynthesisStats(null)
    setOriginalHasContent(false)
    setChallengerHasContent(false)
    setSynthesisHasContent(false)
    origHasContentRef.current = false
    chalHasContentRef.current = false
    synthHasContentRef.current = false
    setHistoryNavIndex(-1)
    setInputSnapshot('')
    pendingOrigRef.current = ''
    pendingChalRef.current = ''
    pendingSynthRef.current = ''
    setCurrentOriginal('')
    setCurrentChallenger('')
    setCurrentSynthesis('')

    const history = session.getHistory()
    session.addUser(question)

    let originalBuffer = ''
    let challengerBuffer = ''
    let synthesisBuffer = ''
    let originalResult: BrainResult | null = null
    let challengerResult: BrainResult | undefined
    let synthResult: SynthesisResult | undefined
    let intentResult: IntentResult | undefined
    let isMirrored = Boolean(challengerId)

    const entryId = randomUUID()
    const createdAt = new Date().toISOString()
    const controller = new AbortController()
    abortRef.current = controller

    startTimesRef.current = new Map<string, number>([
      ['original', Date.now()],
      ...(challengerId ? [['challenger', Date.now()] as [string, number]] : []),
    ])
    lastChunkTimesRef.current = new Map<string, number>()

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
          lastChunkTimesRef.current.set(event.role, Date.now())
          if (event.role === 'original') {
            originalBuffer += event.chunk.delta
            pendingOrigRef.current = originalBuffer
            if (!origHasContentRef.current && event.chunk.delta) {
              origHasContentRef.current = true
              setOriginalHasContent(true)
            }
          } else if (event.role === 'challenger') {
            challengerBuffer += event.chunk.delta
            pendingChalRef.current = challengerBuffer
            if (!chalHasContentRef.current && event.chunk.delta) {
              chalHasContentRef.current = true
              setChallengerHasContent(true)
            }
          }
        }

        if (event.type === 'brain_complete') {
          const completedAt = lastChunkTimesRef.current.get(event.role) ?? Date.now()
          const latency = completedAt - (startTimesRef.current.get(event.role) ?? completedAt)
          if (event.role === 'original') {
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
          } else if (event.role === 'challenger') {
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

        if (event.type === 'synthesizing') {
          setIsSynthesizing(true)
        }

        if (event.type === 'synthesis_chunk') {
          synthesisBuffer += event.chunk.delta
          pendingSynthRef.current = synthesisBuffer
          if (!synthHasContentRef.current && event.chunk.delta) {
            synthHasContentRef.current = true
            setSynthesisHasContent(true)
          }
        }

        if (event.type === 'synthesis_complete') {
          setIsSynthesizing(false)
          synthResult = event.result
          setSynthesisStats(event.result)
        }

        if (event.type === 'all_complete' && originalResult) {
          addHistoryEntry({
            id: entryId,
            createdAt,
            question,
            original: originalResult,
            challenger: challengerResult,
            intent: intentResult,
            synthesis: synthResult?.text,
            agreementScore: synthResult?.agreementScore,
          })

          const exchange: CompletedExchange = {
            id: entryId,
            question,
            intent: intentResult,
            original: formatText(originalResult.text),
            challenger: challengerResult ? formatText(challengerResult.text) : undefined,
            synthesis: synthResult ? formatText(synthResult.text) : undefined,
            agreementScore: synthResult?.agreementScore,
            isMirrored,
          }

          pendingExchangeRef.current = {
            type: 'exchange',
            id: entryId,
            exchange,
            originalId,
            challengerId,
            columns: columnsRef.current
          }
          setTurnCount(prev => prev + 1)
          setActiveQuestion('')
          pendingOrigRef.current = ''
          pendingChalRef.current = ''
          pendingSynthRef.current = ''
          setCurrentOriginal('')
          setCurrentChallenger('')
          setCurrentSynthesis('')
          setIsSynthesizing(false)
          setIsClassifying(false)
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
      setIsSynthesizing(false)
      runningRef.current = false
      abortRef.current = null
    }
  }, [challengerId, engine, formatText, input, originalId, session])

  // ── Input handling ────────────────────────────────────────────────────────────
  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') {
      if (isThinking && abortRef.current) {
        abortRef.current.abort()
        return
      }
      process.exit(0)
    }

    if (key.ctrl && ch === 'r') {
      if (!isThinking && lastQuestionRef.current) {
        setInput(lastQuestionRef.current)
        setHistoryNavIndex(-1)
        setInputSnapshot('')
      }
      return
    }

    if (key.return) { void submit(); return }
    if (key.backspace || key.delete) {
      setInput(p => p.slice(0, -1))
      if (historyNavIndex !== -1) { setHistoryNavIndex(-1); setInputSnapshot('') }
      return
    }

    if (key.upArrow) {
      if (isThinking) return
      const entries = listHistory()
      if (!entries.length) return
      const nextIdx = historyNavIndex === -1 ? 0 : Math.min(historyNavIndex + 1, entries.length - 1)
      if (historyNavIndex === -1) setInputSnapshot(input)
      setHistoryNavIndex(nextIdx)
      setInput(entries[nextIdx].question)
      return
    }
    if (key.downArrow) {
      if (isThinking) return
      if (historyNavIndex === -1) return
      if (historyNavIndex === 0) {
        setHistoryNavIndex(-1)
        setInput(inputSnapshot)
      } else {
        const nextIdx = historyNavIndex - 1
        setHistoryNavIndex(nextIdx)
        setInput(listHistory()[nextIdx].question)
      }
      return
    }

    if (ch && !key.ctrl && !key.meta) {
      if (historyNavIndex !== -1) { setHistoryNavIndex(-1); setInputSnapshot('') }
      setInput(p => p + ch)
    }
  })

  // ── Status bar ────────────────────────────────────────────────────────────────
  let statusIcon: string
  let statusWord: string
  let statusColor: string

  if (sessionMessage) {
    statusIcon = '✓'
    statusWord = sessionMessage
    statusColor = THEME.ready
  } else if (isClassifying) {
    statusIcon = '⊙'
    statusWord = 'classifying...'
    statusColor = THEME.thinking
  } else if (isSynthesizing) {
    statusIcon = '⚖'
    statusWord = 'synthesizing...'
    statusColor = THEME.synthesis
  } else if (isThinking) {
    statusIcon = '⟳'
    statusWord = 'thinking...'
    statusColor = THEME.thinking
  } else {
    statusIcon = '✓'
    statusWord = 'ready'
    statusColor = THEME.ready
  }

  const metricParts: string[] = []

  if (showLatency && originalStats?.latencyMs != null) {
    if (originalStats.outputTokens != null && originalStats.latencyMs > 0) {
      metricParts.push(`orig ${Math.round(originalStats.outputTokens / (originalStats.latencyMs / 1000))}t/s`)
    } else {
      metricParts.push(`orig ${(originalStats.latencyMs / 1000).toFixed(1)}s`)
    }
  }
  if (showLatency && challengerStats?.latencyMs != null) {
    if (challengerStats.outputTokens != null && challengerStats.latencyMs > 0) {
      metricParts.push(`chal ${Math.round(challengerStats.outputTokens / (challengerStats.latencyMs / 1000))}t/s`)
    } else {
      metricParts.push(`chal ${(challengerStats.latencyMs / 1000).toFixed(1)}s`)
    }
  }
  if (showTokenCounts) {
    const origT = formatTokens(originalStats?.inputTokens, originalStats?.outputTokens)
    if (origT) metricParts.push(`orig ${origT}`)
    if (challengerStats) {
      const chalT = formatTokens(challengerStats.inputTokens, challengerStats.outputTokens)
      if (chalT) metricParts.push(`chal ${chalT}`)
    }
    if (synthesisStats) {
      const synthT = formatTokens(synthesisStats.inputTokens, synthesisStats.outputTokens)
      if (synthT) metricParts.push(`synth ${synthT}`)
    }
  }
  if (synthesisStats?.agreementScore !== undefined) {
    metricParts.push(`agreement ${synthesisStats.agreementScore}%`)
  }
  metricParts.push(`${turnCount} turn${turnCount !== 1 ? 's' : ''}`)

  const synthScoreLabel = synthesisStats?.agreementScore !== undefined
    ? `  ${scoreBar(synthesisStats.agreementScore)}  ${synthesisStats.agreementScore}%  ${judgerId ?? ''}`
    : `  ${judgerId ?? ''}`

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column">

      <Static items={staticItems}>
        {(item) => (
          <React.Fragment key={item.id}>
            {item.type === 'header' ? (
              <HeaderView
                originalId={item.originalId}
                challengerId={item.challengerId}
                judgerId={item.judgerId}
                intensity={item.intensity}
                persona={item.persona}
              />
            ) : (
              <ExchangeView
                exchange={item.exchange}
                originalId={item.originalId}
                challengerId={item.challengerId}
                columns={item.columns}
              />
            )}
          </React.Fragment>
        )}
      </Static>

      {/* In-progress streaming */}
      {isThinking && activeQuestion && (
        <Box flexDirection="column">
          <Text bold>
            <Text color={THEME.input}>❯ </Text>
            <Text wrap="truncate">{activeQuestion}</Text>
          </Text>

          {intent ? (
            <Box marginTop={0}>
              <IntentBadge
                category={intent.category}
                mirrored={intent.shouldMirror}
                confidence={intent.confidence}
              />
            </Box>
          ) : isClassifying ? (
            <Text dimColor color={THEME.dim}>⊙ classifying...</Text>
          ) : null}

          <Box marginTop={1} flexDirection={showSideBySide ? 'row' : 'column'}>
            <BrainPanel
              title={`ORIGINAL  ${originalId}`}
              width={panelWidth}
              marginRight={showSideBySide && showChallengerPanel ? 1 : 0}
              titleColor={THEME.original}
            >
              <StreamingText
                value={liveLines(currentOriginal, liveLineLimit, panelWidth - 5)}
                waiting={!originalHasContent}
                spinnerFrame={spinnerFrame}
              />
            </BrainPanel>

            {showChallengerPanel && (
              <BrainPanel
                title={`CHALLENGER  ${challengerId}  [${intensity}]`}
                width={panelWidth}
                titleColor={THEME.challenger}
              >
                <StreamingText
                  value={liveLines(currentChallenger, liveLineLimit, panelWidth - 5)}
                  waiting={!challengerHasContent}
                  spinnerFrame={spinnerFrame}
                />
              </BrainPanel>
            )}
          </Box>

          {(isSynthesizing || currentSynthesis) && (
            <Box marginTop={1}>
              <BrainPanel
                title={`SYNTHESIS${isSynthesizing ? '  synthesizing...' : synthScoreLabel}`}
                width={columns}
                borderColor={THEME.synthesis}
                borderStyle="bold"
              >
                <StreamingText
                  value={liveLines(stripAgreementHeader(currentSynthesis), liveLineLimit, columns - 5)}
                  waiting={isSynthesizing && !synthesisHasContent}
                  spinnerFrame={spinnerFrame}
                />
              </BrainPanel>
            </Box>
          )}
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box marginTop={1}>
          <Text color={THEME.error}>✕  {error}</Text>
        </Box>
      )}

      {/* Status */}
      <Box marginTop={1}>
        <Text bold color={statusColor} dimColor>{statusIcon} </Text>
        <Text color={statusColor} dimColor>{statusWord}</Text>
        {metricParts.length > 0 && (
          <Text color={THEME.dim} dimColor>{'  ' + metricParts.join('  ·  ')}</Text>
        )}
      </Box>

      {/* Input */}
      <Box>
        <Text color={THEME.input} bold>{'❯ '}</Text>
        {historyNavIndex >= 0 && (
          <Text color={THEME.dim}>{`[${historyNavIndex + 1}] `}</Text>
        )}
        <Text>{input}</Text>
        <Text color={isThinking ? THEME.dim : THEME.input}>█</Text>
      </Box>

    </Box>
  )
}
