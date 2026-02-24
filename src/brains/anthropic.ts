import Anthropic from '@anthropic-ai/sdk'
import type {
  ChatOptions,
  CompletedResponse,
  ConversationMessage,
  PingResult,
  StreamChunk
} from '../types/index.js'
import type { BrainAdapter } from './adapter.js'

export class AnthropicAdapter implements BrainAdapter {
  readonly id: string
  readonly provider = 'anthropic' as const
  readonly capabilities = { streaming: true }
  private readonly client: Anthropic
  private readonly model: string

  constructor(id: string, model: string, apiKeyEnvVar: string) {
    this.id = id
    this.model = model
    const apiKey = process.env[apiKeyEnvVar]
    if (!apiKey) {
      throw new Error(
        `Missing API key. Set ${apiKeyEnvVar} or enable MOCK_BRAINS=true.`
      )
    }
    this.client = new Anthropic({ apiKey })
  }

  async ping(): Promise<PingResult> {
    const start = Date.now()
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      })
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
    const filtered = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }))

    // streaming helper — yields text deltas token-by-token, abortable
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: options?.maxTokens ?? 1024,
        system: systemPrompt,
        messages: filtered,
      },
      { signal: options?.signal }
    )

    let text = ''

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        const delta = event.delta.text
        text += delta
        yield { delta, isFinal: false }
      }
    }

    const finalMessage = await stream.finalMessage()
    const inputTokens = finalMessage.usage.input_tokens
    const outputTokens = finalMessage.usage.output_tokens

    yield { delta: '', isFinal: true, inputTokens, outputTokens }
    return { text, inputTokens, outputTokens }
  }

  estimateTokens(messages: ConversationMessage[]): number {
    return messages.reduce((sum, msg) => sum + msg.content.length, 0)
  }

  async dispose(): Promise<void> {
    return
  }
}
