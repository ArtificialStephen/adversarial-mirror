import { GoogleGenerativeAI } from '@google/generative-ai'
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
  private readonly client: GoogleGenerativeAI

  constructor(id: string, model: string, apiKeyEnvVar: string) {
    this.id = id
    this.model = model
    const apiKey = process.env[apiKeyEnvVar]
    if (!apiKey) {
      throw new Error(
        `Missing API key. Set ${apiKeyEnvVar} or enable MOCK_BRAINS=true.`
      )
    }
    this.client = new GoogleGenerativeAI(apiKey)
  }

  async ping(): Promise<PingResult> {
    return { ok: true }
  }

  async *chat(
    messages: ConversationMessage[],
    systemPrompt: string,
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk, CompletedResponse> {
    const model = this.client.getGenerativeModel({ model: this.model })
    const contents = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
      }))

    const result = await model.generateContentStream({
      contents,
      systemInstruction: {
        role: 'system',
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens
      }
    })

    let text = ''
    for await (const chunk of result.stream) {
      const delta = chunk.text()
      if (delta) {
        text += delta
        yield { delta, isFinal: false }
      }
    }

    let inputTokens: number | undefined
    let outputTokens: number | undefined

    try {
      const response = await result.response
      const usage = (response as any).usageMetadata
      if (usage) {
        inputTokens = usage.promptTokenCount
        outputTokens =
          usage.candidatesTokenCount ?? usage.totalTokenCount ?? undefined
      }
    } catch {
      // usage metadata not available
    }

    const response: CompletedResponse = { text, inputTokens, outputTokens }
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
