import type { OAuthTokens } from '../auth/token-store.js'
import type { BrainConfig } from '../config/schema.js'
import type { BrainAdapter } from './adapter.js'
import { AnthropicAdapter } from './anthropic.js'
import { GeminiAdapter } from './gemini.js'
import { GeminiOAuthAdapter } from './gemini-oauth.js'
import { MockAdapter } from './mock.js'
import { OllamaAdapter } from './ollama.js'
import { OpenAIAdapter } from './openai.js'
import { ChatGPTOAuthAdapter } from './openai-oauth.js'

/**
 * @param oauthTokens  Map of brainId → OAuthTokens.
 *                     Required for any brain with authType === 'oauth'.
 */
export function createAdapter(
  config: BrainConfig,
  overrides: Partial<Pick<BrainConfig, 'model' | 'apiKeyEnvVar'>> = {},
  oauthTokens?: Map<string, OAuthTokens>
): BrainAdapter {
  const effective = { ...config, ...overrides }
  if (process.env.MOCK_BRAINS) {
    return new MockAdapter(effective.id, `Mock response from ${effective.id}.`)
  }

  if (effective.authType === 'oauth') {
    const tok = oauthTokens?.get(effective.id)
    if (!tok) {
      throw new Error(
        `No OAuth token found for brain '${effective.id}'. Run: mirror auth login ${effective.provider}`
      )
    }
    switch (effective.provider) {
      case 'openai':
        return new ChatGPTOAuthAdapter(effective.id, effective.model, tok)
      case 'gemini':
        return new GeminiOAuthAdapter(effective.id, effective.model, () => Promise.resolve(tok.accessToken), tok.projectId)
      default:
        throw new Error(`OAuth not supported for provider: ${effective.provider}`)
    }
  }

  switch (effective.provider) {
    case 'anthropic': {
      const key = effective.apiKeyEnvVar
      if (!key) throw new Error(`Brain '${effective.id}' requires apiKeyEnvVar`)
      return new AnthropicAdapter(effective.id, effective.model, key)
    }
    case 'openai': {
      const key = effective.apiKeyEnvVar
      if (!key) throw new Error(`Brain '${effective.id}' requires apiKeyEnvVar`)
      return new OpenAIAdapter(effective.id, effective.model, key)
    }
    case 'gemini': {
      const key = effective.apiKeyEnvVar
      if (!key) throw new Error(`Brain '${effective.id}' requires apiKeyEnvVar`)
      return new GeminiAdapter(effective.id, effective.model, key)
    }
    case 'ollama':
      return new OllamaAdapter(effective.id, effective.model, effective.baseUrl)
    case 'mock':
      return new MockAdapter(effective.id, `Mock response from ${effective.id}.`)
    default:
      throw new Error(`Unsupported provider: ${(effective as BrainConfig).provider}`)
  }
}
