import React, { useCallback, useRef, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { IntentResult } from '../types/index.js'
import type { MirrorEngine } from '../engine/mirror-engine.js'
import { Session } from '../engine/session.js'
import { BrainPanel } from './components/BrainPanel.js'
import { ChatLayout } from './components/ChatLayout.js'
import { IntentBadge } from './components/IntentBadge.js'
import { StatusBar } from './components/StatusBar.js'
import { StreamingText } from './components/StreamingText.js'

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
}

export function MirrorApp({
  engine,
  session,
  originalId,
  challengerId,
  intensity
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

    session.addUser(question)

    let originalBuffer = ''
    let challengerBuffer = ''

    try {
      for await (const event of engine.run(question, session.getHistory())) {
        if (event.type === 'classifying') {
          setIntent(null)
        }

        if (event.type === 'classified') {
          setIntent(event.result)
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
            session.addAssistant(answer)
            setOriginalTurns((prev) => [...prev, { question, answer }])
            setCurrentOriginal('')
          } else if (event.brainId === challengerId) {
            const answer = event.response.text || challengerBuffer
            setChallengerTurns((prev) => [...prev, { question, answer }])
            setCurrentChallenger('')
          }
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
    }
  }, [challengerId, engine, input, originalId, session])

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') {
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

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text>Adversarial Mirror</Text>
        <Text>Intensity: {intensity}</Text>
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
        <ChatLayout>
          <BrainPanel title={`ORIGINAL  ${originalId}`}>
            {originalTurns.map((turn, index) => (
              <Box key={`orig-${index}`} flexDirection="column" marginTop={1}>
                <Text color="cyan">Q: {turn.question}</Text>
                <Text>A: {turn.answer}</Text>
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
                  <Text>A: {turn.answer}</Text>
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
        <StatusBar
          text={
            isThinking
              ? 'Thinking... (Enter to submit, Ctrl+C to exit)'
              : 'Enter to submit, Ctrl+C to exit'
          }
        />
      </Box>
      <Text>{`> ${input}`}</Text>
    </Box>
  )
}
