import type { BrainConfig } from '../config/schema.js'
import type { BrainAdapter } from './adapter.js'
import { AnthropicAdapter } from './anthropic.js'
import { GeminiAdapter } from './gemini.js'
import { MockAdapter } from './mock.js'
import { OpenAIAdapter } from './openai.js'

export function createAdapter(config: BrainConfig): BrainAdapter {
  if (process.env.MOCK_BRAINS) {
    return new MockAdapter(config.id, `Mock response from ${config.id}.`)
  }

  switch (config.provider) {
    case 'anthropic':
      return new AnthropicAdapter(config.id, config.model, config.apiKeyEnvVar)
    case 'openai':
      return new OpenAIAdapter(config.id, config.model, config.apiKeyEnvVar)
    case 'gemini':
      return new GeminiAdapter(config.id, config.model, config.apiKeyEnvVar)
    case 'mock':
      return new MockAdapter(config.id, `Mock response from ${config.id}.`)
    default:
      throw new Error(`Unsupported provider: ${config.provider}`)
  }
}
