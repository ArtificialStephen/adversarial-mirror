import type {
  ChatOptions,
  CompletedResponse,
  ConversationMessage,
  PingResult,
  StreamChunk
} from '../types/index.js'
import type { BrainAdapter } from './adapter.js'

// Same endpoint as gemini-cli (google-gemini/gemini-cli)
// cloud-platform scope works here; generativelanguage.googleapis.com does not
const API_BASE = 'https://cloudcode-pa.googleapis.com/v1internal'

export class GeminiOAuthAdapter implements BrainAdapter {
  readonly id: string
  readonly provider = 'gemini' as const
  readonly capabilities = { streaming: true }
  private readonly model: string
  private readonly getToken: () => Promise<string>
  private readonly projectId: string | undefined

  constructor(id: string, model: string, getToken: () => Promise<string>, projectId?: string) {
    this.id = id
    this.model = model
    this.getToken = getToken
    this.projectId = projectId
  }

  async ping(): Promise<PingResult> {
    const start = Date.now()
    try {
      const token = await this.getToken()
      // Use countTokens as a lightweight ping
      const res = await fetch(`${API_BASE}:countTokens`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(this.projectId ? { project: this.projectId } : {}),
          request: {
            model: `models/${this.model}`,
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          },
        }),
      })
      if (!res.ok) {
        const body = await res.text()
        return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` }
      }
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
    const token = await this.getToken()

    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    const body: Record<string, unknown> = {
      model: this.model,
      ...(this.projectId ? { project: this.projectId } : {}),
      request: {
        contents,
        systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
        generationConfig: {
          ...(options?.temperature != null ? { temperature: options.temperature } : {}),
          ...(options?.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
        },
      },
    }

    const res = await fetch(`${API_BASE}:streamGenerateContent?alt=sse`, {
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
          // Response is wrapped: { response: { candidates: [...], usageMetadata: {...} } }
          const res = event?.response ?? event
          const delta: string = res?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          if (delta) {
            fullText += delta
            yield { delta, isFinal: false }
          }
          const usage = res?.usageMetadata
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
