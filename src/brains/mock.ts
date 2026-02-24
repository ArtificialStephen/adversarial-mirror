import type {
  ChatOptions,
  CompletedResponse,
  ConversationMessage,
  PingResult,
  StreamChunk
} from '../types/index.js'
import type { BrainAdapter } from './adapter.js'

export class MockAdapter implements BrainAdapter {
  readonly id: string
  readonly provider = 'mock' as const
  readonly capabilities = { streaming: true }
  private readonly responseText: string

  constructor(id: string, responseText = 'Mock response.') {
    this.id = id
    this.responseText = responseText
  }

  async ping(): Promise<PingResult> {
    return { ok: true, latencyMs: 1 }
  }

  async *chat(
    _messages: ConversationMessage[],
    _systemPrompt: string,
    _options?: ChatOptions
  ): AsyncGenerator<StreamChunk, CompletedResponse> {
    for (const chunk of this.responseText.split(' ')) {
      yield { delta: `${chunk} `, isFinal: false }
    }
    const response: CompletedResponse = { text: this.responseText }
    yield { delta: '', isFinal: true }
    return response
  }

  estimateTokens(messages: ConversationMessage[]): number {
    return messages.reduce((sum, msg) => sum + msg.content.length, 0)
  }

  async dispose(): Promise<void> {
    return
  }
}
