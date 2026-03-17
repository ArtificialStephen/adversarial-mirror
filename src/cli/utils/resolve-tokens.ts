import type { BrainConfig } from '../../config/schema.js'
import { getValidToken, loadTokens } from '../../auth/index.js'
import type { OAuthTokens } from '../../auth/index.js'

/**
 * For every brain with authType === 'oauth', resolve (and refresh if needed)
 * its access token. Returns a Map<brainId, OAuthTokens>.
 */
export async function resolveOAuthTokens(
  brains: BrainConfig[]
): Promise<Map<string, OAuthTokens>> {
  const tokens = new Map<string, OAuthTokens>()
  const oauthBrains = brains.filter(b => b.authType === 'oauth')

  for (const brain of oauthBrains) {
    if (brain.provider === 'openai' || brain.provider === 'gemini') {
      const accessToken = await getValidToken(brain.provider)
      const stored = loadTokens(brain.provider)
      tokens.set(brain.id, {
        accessToken,
        refreshToken: stored?.refreshToken,
        expiresAt: stored?.expiresAt,
        idToken: stored?.idToken,
        projectId: stored?.projectId,
      })
    }
  }

  return tokens
}
