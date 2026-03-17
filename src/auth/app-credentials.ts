import { loadConfig } from '../config/loader.js'

export interface OpenAIAppCredentials {
  clientId: string
}

export interface GeminiAppCredentials {
  clientId: string
  clientSecret: string
}

// Default: openclaw's public OAuth client (open-source, MIT licensed).
// Override via OPENAI_OAUTH_CLIENT_ID env var or mirror auth setup openai.
const OPENAI_DEFAULT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

export function getOpenAIAppCredentials(): OpenAIAppCredentials {
  const clientId =
    process.env.OPENAI_OAUTH_CLIENT_ID ??
    loadConfig().oauthApps.openaiClientId ??
    OPENAI_DEFAULT_CLIENT_ID
  return { clientId }
}

export function getGeminiAppCredentials(): GeminiAppCredentials {
  const apps = loadConfig().oauthApps
  const clientId = process.env.GEMINI_OAUTH_CLIENT_ID ?? apps.geminiClientId
  const clientSecret = process.env.GEMINI_OAUTH_CLIENT_SECRET ?? apps.geminiClientSecret
  if (!clientId || !clientSecret) {
    throw new Error(
      'Gemini OAuth app not configured.\n' +
      'Run: mirror auth setup gemini\n' +
      'Or set GEMINI_OAUTH_CLIENT_ID and GEMINI_OAUTH_CLIENT_SECRET environment variables.'
    )
  }
  return { clientId, clientSecret }
}
