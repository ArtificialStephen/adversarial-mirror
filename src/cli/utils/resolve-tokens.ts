import type { BrainConfig } from '../../config/schema.js'
import { getValidToken } from '../../auth/index.js'

/**
 * For every brain with authType === 'oauth', resolve (and refresh if needed)
 * its access token. Returns a Map<brainId, accessToken>.
 */
export async function resolveOAuthTokens(
  brains: BrainConfig[]
): Promise<Map<string, string>> {
  const tokens = new Map<string, string>()
  const oauthBrains = brains.filter(b => b.authType === 'oauth')

  for (const brain of oauthBrains) {
    if (brain.provider === 'openai' || brain.provider === 'gemini') {
      const token = await getValidToken(brain.provider)
      tokens.set(brain.id, token)
    }
  }

  return tokens
}
