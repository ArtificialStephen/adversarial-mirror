import type {
  ChatOptions,
  CompletedResponse,
  ConversationMessage,
  PingResult,
  StreamChunk,
} from '../types/index.js'
import type { BrainAdapter } from './adapter.js'

interface OllamaStreamChunk {
  model?: string
  message?: { role?: string; content?: string }
  done?: boolean
  prompt_eval_count?: number
  eval_count?: number
}

export class OllamaAdapter implements BrainAdapter {
  readonly id: string
  readonly provider = 'ollama' as const
  readonly capabilities = { streaming: true }
  private readonly model: string
  private readonly baseUrl: string

  constructor(id: string, model: string, baseUrl = 'http://localhost:11434') {
    this.id = id
    this.model = model
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async ping(): Promise<PingResult> {
    const start = Date.now()
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async *chat(
    messages: ConversationMessage[],
    systemPrompt: string,
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk, CompletedResponse> {
    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role, content: m.content })),
      ],
      stream: true,
      options: {
        temperature: options?.temperature,
        num_predict: options?.maxTokens ?? 2048,
      },
    })

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: options?.signal,
    })

    if (!res.ok) {
      throw new Error(`Ollama error: HTTP ${res.status} — ${await res.text()}`)
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let fullText = ''
    let inputTokens: number | undefined
    let outputTokens: number | undefined

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const obj = JSON.parse(line) as OllamaStreamChunk
          if (obj.message?.content) {
            const delta = obj.message.content
            fullText += delta
            yield { delta, isFinal: false }
          }
          if (obj.done) {
            inputTokens = obj.prompt_eval_count
            outputTokens = obj.eval_count
          }
        } catch { /* skip malformed lines */ }
      }
    }

    yield { delta: '', isFinal: true, inputTokens, outputTokens }
    return { text: fullText, inputTokens, outputTokens }
  }

  estimateTokens(messages: ConversationMessage[]): number {
    return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4)
  }

  async dispose(): Promise<void> {
    return
  }
}
