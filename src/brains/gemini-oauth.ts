import type {
  ChatOptions,
  CompletedResponse,
  ConversationMessage,
  PingResult,
  StreamChunk
} from '../types/index.js'
import type { BrainAdapter } from './adapter.js'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export class GeminiOAuthAdapter implements BrainAdapter {
  readonly id: string
  readonly provider = 'gemini' as const
  readonly capabilities = { streaming: true }
  private readonly model: string
  private readonly getToken: () => Promise<string>

  constructor(id: string, model: string, getToken: () => Promise<string>) {
    this.id = id
    this.model = model
    this.getToken = getToken
  }

  async ping(): Promise<PingResult> {
    try {
      const token = await this.getToken()
      const res = await fetch(`${API_BASE}/models?pageSize=1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return { ok: res.ok }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async *chat(
    messages: ConversationMessage[],
    systemPrompt: string,
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk, CompletedResponse> {
    const token = await this.getToken()

    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    const body = {
      contents,
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens,
      },
    }

    const url = `${API_BASE}/models/${this.model}:streamGenerateContent?alt=sse`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Gemini OAuth request failed (${res.status}): ${errText}`)
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    let inputTokens: number | undefined
    let outputTokens: number | undefined

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const event = JSON.parse(data)
          const delta: string = event?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          if (delta) {
            fullText += delta
            yield { delta, isFinal: false }
          }
          const usage = event?.usageMetadata
          if (usage) {
            inputTokens = usage.promptTokenCount
            outputTokens = usage.candidatesTokenCount ?? usage.totalTokenCount
          }
        } catch {
          // Ignore malformed SSE data lines
        }
      }
    }

    yield { delta: '', isFinal: true, inputTokens, outputTokens }
    return { text: fullText, inputTokens, outputTokens }
  }

  estimateTokens(messages: ConversationMessage[]): number {
    return messages.reduce((sum, m) => sum + m.content.length, 0)
  }

  async dispose(): Promise<void> {
    return
  }
}
