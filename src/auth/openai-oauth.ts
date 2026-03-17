import { randomBytes } from 'node:crypto'
import { getOpenAIAppCredentials } from './app-credentials.js'
import { generatePKCE } from './pkce.js'
import { startCallbackServer } from './callback-server.js'
import { openBrowser } from './open-browser.js'
import { exchangeCodeForTokens } from './token-exchange.js'
import { saveTokens } from './token-store.js'

const AUTH_URL = 'https://auth.openai.com/oauth/authorize'
const TOKEN_URL = 'https://auth.openai.com/oauth/token'
const SCOPES = 'openid profile email offline_access'
const AUDIENCE = 'https://api.openai.com/v1'
// Port registered for this OAuth client — must match exactly.
const CALLBACK_PORT = 1455

export async function loginOpenAI(): Promise<void> {
  const { clientId } = getOpenAIAppCredentials()
  const redirectUri = `http://localhost:${CALLBACK_PORT}/callback`
  const { codeVerifier, codeChallenge } = generatePKCE()
  const state = randomBytes(16).toString('hex')

  const { waitForCode, close } = startCallbackServer(CALLBACK_PORT, state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    audience: AUDIENCE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  })

  const authUrl = `${AUTH_URL}?${params}`
  process.stdout.write(
    `Opening browser for OpenAI login...\nIf it doesn't open automatically, visit:\n  ${authUrl}\n`
  )
  openBrowser(authUrl)

  try {
    const { code } = await waitForCode()
    const tokens = await exchangeCodeForTokens(
      TOKEN_URL, clientId, code, redirectUri, codeVerifier
    )
    saveTokens('openai', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
    })
    process.stdout.write('OpenAI login successful.\n')
  } finally {
    close()
  }
}
