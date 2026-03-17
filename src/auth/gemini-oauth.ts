import { getGeminiAppCredentials } from './app-credentials.js'
import { generatePKCE } from './pkce.js'
import { startCallbackServer } from './callback-server.js'
import { openBrowser } from './open-browser.js'
import { exchangeCodeForTokens } from './token-exchange.js'
import { saveTokens } from './token-store.js'
import { resolveGeminiProject } from './gemini-setup.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')
const CALLBACK_PORT = 8085
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/oauth2callback`

export async function loginGemini(): Promise<void> {
  const { clientId, clientSecret } = getGeminiAppCredentials()
  const { codeVerifier, codeChallenge } = generatePKCE()

  const { waitForCode, close } = startCallbackServer(CALLBACK_PORT, codeVerifier, '/oauth2callback')

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: codeVerifier,
    access_type: 'offline',
    prompt: 'consent',
  })

  const authUrl = `${AUTH_URL}?${params}`
  process.stdout.write(
    `Opening browser for Gemini (Google) login...\nIf it doesn't open automatically, visit:\n  ${authUrl}\n`
  )
  openBrowser(authUrl)

  try {
    const { code } = await waitForCode()
    const tokens = await exchangeCodeForTokens(
      TOKEN_URL, clientId, code, REDIRECT_URI, codeVerifier, clientSecret
    )
    const projectId = await resolveGeminiProject(tokens.access_token)
    saveTokens('gemini', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
      projectId,
    })
    process.stdout.write('Gemini login successful.\n')
  } finally {
    close()
  }
}
