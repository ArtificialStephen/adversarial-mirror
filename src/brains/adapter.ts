import type {
  BrainCapabilities,
  BrainProvider,
  ChatOptions,
  CompletedResponse,
  ConversationMessage,
  PingResult,
  StreamChunk
} from '../types/index.js'

export interface BrainAdapter {
  readonly id: string
  readonly provider: BrainProvider
  readonly capabilities: BrainCapabilities

  ping(): Promise<PingResult>
  chat(
    messages: ConversationMessage[],
    systemPrompt: string,
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk, CompletedResponse>
  estimateTokens(messages: ConversationMessage[]): number
  dispose(): Promise<void>
}

export class BrainRegistry {
  private readonly adapters = new Map<string, BrainAdapter>()

  register(adapter: BrainAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Brain already registered: ${adapter.id}`)
    }
    this.adapters.set(adapter.id, adapter)
  }

  get(id: string): BrainAdapter {
    const adapter = this.adapters.get(id)
    if (!adapter) {
      throw new Error(`Unknown brain: ${id}`)
    }
    return adapter
  }

  list(): BrainAdapter[] {
    return Array.from(this.adapters.values())
  }
}
