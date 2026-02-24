import OpenAI from 'openai'
import type {
  ChatOptions,
  CompletedResponse,
  ConversationMessage,
  PingResult,
  StreamChunk
} from '../types/index.js'
import type { BrainAdapter } from './adapter.js'

export class OpenAIAdapter implements BrainAdapter {
  readonly id: string
  readonly provider = 'openai' as const
  readonly capabilities = { streaming: true }
  private readonly model: string
  private readonly client: OpenAI

  constructor(id: string, model: string, apiKeyEnvVar: string) {
    this.id = id
    this.model = model
    const apiKey = process.env[apiKeyEnvVar]
    if (!apiKey) {
      throw new Error(
        `Missing API key. Set ${apiKeyEnvVar} or enable MOCK_BRAINS=true.`
      )
    }
    this.client = new OpenAI({ apiKey })
  }

  async ping(): Promise<PingResult> {
    const start = Date.now()
    try {
      await this.client.models.list()
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
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        stream: true,
        stream_options: { include_usage: true },
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
            .filter((message) => message.role !== 'system')
            .map((message) => ({
              role: message.role === 'assistant' ? 'assistant' : 'user',
              content: message.content
            }))
        ]
      },
      { signal: options?.signal }
    )

    let text = ''
    let inputTokens: number | undefined
    let outputTokens: number | undefined

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content ?? ''
      if (delta) {
        text += delta
        yield { delta, isFinal: false }
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens
        outputTokens = chunk.usage.completion_tokens
      }
    }

    const response: CompletedResponse = {
      text,
      inputTokens,
      outputTokens
    }

    yield { delta: '', isFinal: true, inputTokens, outputTokens }
    return response
  }

  estimateTokens(messages: ConversationMessage[]): number {
    return messages.reduce((sum, msg) => sum + msg.content.length, 0)
  }

  async dispose(): Promise<void> {
    return
  }
}
