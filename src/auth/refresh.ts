import { getOpenAIAppCredentials, getGeminiAppCredentials } from './app-credentials.js'
import { refreshAccessToken } from './token-exchange.js'
import { loadTokens, saveTokens, type OAuthTokens } from './token-store.js'

const OPENAI_TOKEN_ENDPOINT = 'https://auth.openai.com/oauth/token'
const GEMINI_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

/**
 * Returns a valid access token for the provider, refreshing automatically
 * if the stored token is within 60 seconds of expiry.
 */
export async function getValidToken(provider: 'openai' | 'gemini'): Promise<string> {
  const stored = loadTokens(provider)
  if (!stored) {
    throw new Error(
      `Not authenticated with ${provider}. Run: mirror auth login ${provider}`
    )
  }

  // Not expired (with 60s buffer) — return as-is
  if (!stored.expiresAt || Date.now() < stored.expiresAt - 60_000) {
    return stored.accessToken
  }

  // Need to refresh
  if (!stored.refreshToken) {
    throw new Error(
      `OAuth token for ${provider} has expired. Re-run: mirror auth login ${provider}`
    )
  }

  const tokenEndpoint = provider === 'openai' ? OPENAI_TOKEN_ENDPOINT : GEMINI_TOKEN_ENDPOINT
  const { clientId, ...rest } = provider === 'openai'
    ? getOpenAIAppCredentials()
    : getGeminiAppCredentials()
  const clientSecret = 'clientSecret' in rest ? rest.clientSecret : undefined

  const resp = await refreshAccessToken(tokenEndpoint, clientId, stored.refreshToken, clientSecret)
  const updated: OAuthTokens = {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token ?? stored.refreshToken,
    expiresAt: resp.expires_in ? Date.now() + resp.expires_in * 1000 : undefined,
  }
  saveTokens(provider, updated)
  return updated.accessToken
}
