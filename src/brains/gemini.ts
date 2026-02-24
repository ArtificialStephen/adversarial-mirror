import type {
  ChatOptions,
  CompletedResponse,
  ConversationMessage,
  PingResult,
  StreamChunk
} from '../types/index.js'
import type { BrainAdapter } from './adapter.js'

export class GeminiAdapter implements BrainAdapter {
  readonly id: string
  readonly provider = 'gemini' as const
  readonly capabilities = { streaming: true }
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
  }

  async ping(): Promise<PingResult> {
    return { ok: true }
  }

  async *chat(
    _messages: ConversationMessage[],
    _systemPrompt: string,
    _options?: ChatOptions
  ): AsyncGenerator<StreamChunk, CompletedResponse> {
    const response: CompletedResponse = { text: 'Gemini adapter not implemented.' }
    yield { delta: response.text, isFinal: true }
    return response
  }

  estimateTokens(messages: ConversationMessage[]): number {
    return messages.reduce((sum, msg) => sum + msg.content.length, 0)
  }

  async dispose(): Promise<void> {
    return
  }
}
