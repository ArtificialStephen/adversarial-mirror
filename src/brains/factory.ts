import type { BrainConfig } from '../config/schema.js'
import type { BrainAdapter } from './adapter.js'
import { AnthropicAdapter } from './anthropic.js'
import { GeminiAdapter } from './gemini.js'
import { MockAdapter } from './mock.js'
import { OpenAIAdapter } from './openai.js'

export function createAdapter(
  config: BrainConfig,
  overrides: Partial<Pick<BrainConfig, 'model' | 'apiKeyEnvVar'>> = {}
): BrainAdapter {
  const effective = { ...config, ...overrides }
  if (process.env.MOCK_BRAINS) {
    return new MockAdapter(effective.id, `Mock response from ${effective.id}.`)
  }

  switch (effective.provider) {
    case 'anthropic':
      return new AnthropicAdapter(
        effective.id,
        effective.model,
        effective.apiKeyEnvVar
      )
    case 'openai':
      return new OpenAIAdapter(
        effective.id,
        effective.model,
        effective.apiKeyEnvVar
      )
    case 'gemini':
      return new GeminiAdapter(
        effective.id,
        effective.model,
        effective.apiKeyEnvVar
      )
    case 'mock':
      return new MockAdapter(effective.id, `Mock response from ${effective.id}.`)
    default:
      throw new Error(`Unsupported provider: ${effective.provider}`)
  }
}
