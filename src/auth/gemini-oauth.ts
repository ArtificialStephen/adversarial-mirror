import { randomBytes } from 'node:crypto'
import { getGeminiAppCredentials } from './app-credentials.js'
import { generatePKCE } from './pkce.js'
import { findFreePort, startCallbackServer } from './callback-server.js'
import { openBrowser } from './open-browser.js'
import { exchangeCodeForTokens } from './token-exchange.js'
import { saveTokens } from './token-store.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

export async function loginGemini(): Promise<void> {
  const { clientId, clientSecret } = getGeminiAppCredentials()
  const port = await findFreePort()
  const redirectUri = `http://localhost:${port}/callback`
  const { codeVerifier, codeChallenge } = generatePKCE()
  const state = randomBytes(16).toString('hex')

  const { waitForCode, close } = startCallbackServer(port, state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  })

  const authUrl = `${AUTH_URL}?${params}`
  process.stdout.write(
    `Opening browser for Gemini (Google) login...\nIf it doesn't open automatically, visit:\n  ${authUrl}\n`
  )
  openBrowser(authUrl)

  try {
    const { code } = await waitForCode()
    const tokens = await exchangeCodeForTokens(
      TOKEN_URL, clientId, code, redirectUri, codeVerifier, clientSecret
    )
    saveTokens('gemini', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
    })
    process.stdout.write('Gemini login successful.\n')
  } finally {
    close()
  }
}
