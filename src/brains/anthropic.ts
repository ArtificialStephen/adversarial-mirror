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
  readonly capabilities = { streaming: false }
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
    return { ok: true }
  }

  async *chat(
    messages: ConversationMessage[],
    systemPrompt: string,
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk, CompletedResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 1024,
      system: systemPrompt,
      messages: messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content
        }))
    })

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()

    const completed: CompletedResponse = {
      text,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens
    }

    yield {
      delta: text,
      isFinal: true,
      inputTokens: completed.inputTokens,
      outputTokens: completed.outputTokens
    }
    return completed
  }

  estimateTokens(messages: ConversationMessage[]): number {
    return messages.reduce((sum, msg) => sum + msg.content.length, 0)
  }

  async dispose(): Promise<void> {
    return
  }
}
