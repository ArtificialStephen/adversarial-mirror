import React, { useCallback, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { BrainAdapter, ConversationMessage } from '../types/index.js'
import { Session } from '../engine/session.js'

interface AppProps {
  adapter: BrainAdapter
  session: Session
  systemPrompt: string
}

export function App({ adapter, session, systemPrompt }: AppProps): JSX.Element {
  const [input, setInput] = useState('')
  const [transcript, setTranscript] = useState<ConversationMessage[]>([])
  const [currentResponse, setCurrentResponse] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(async () => {
    if (isThinking) {
      return
    }

    const question = input.trim()
    if (!question) {
      return
    }

    setInput('')
    setError(null)
    setTranscript((prev) => [...prev, { role: 'user', content: question }])
    session.addUser(question)
    setIsThinking(true)
    setCurrentResponse('')

    try {
      const stream = adapter.chat(session.getHistory(), systemPrompt)
      let buffer = ''

      for await (const chunk of stream) {
        if (chunk.delta) {
          buffer += chunk.delta
          setCurrentResponse(buffer)
        }
      }

      session.addAssistant(buffer)
      setTranscript((prev) => [
        ...prev,
        { role: 'assistant', content: buffer || '(empty response)' }
      ])
    } catch (err) {
      setError((err as Error).message ?? 'Unknown error')
    } finally {
      setCurrentResponse('')
      setIsThinking(false)
    }
  }, [adapter, input, isThinking, session, systemPrompt])

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

  return (
    <Box flexDirection="column">
      <Text>Adversarial Mirror (Phase 1)</Text>
      <Box flexDirection="column" marginTop={1}>
        {transcript.map((message, index) => (
          <Text key={`${message.role}-${index}`}>
            {message.role === 'user' ? 'You' : 'Assistant'}: {message.content}
          </Text>
        ))}
        {isThinking && (
          <Text color="yellow">Assistant: {currentResponse || '...'}</Text>
        )}
        {error && <Text color="red">Error: {error}</Text>}
      </Box>
      <Text>{`> ${input}`}</Text>
    </Box>
  )
}
