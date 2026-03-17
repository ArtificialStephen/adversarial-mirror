import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { loginOpenAI } from '../../auth/openai-oauth.js'
import { loginGemini } from '../../auth/gemini-oauth.js'
import { deleteTokens, loadTokens, allProviders } from '../../auth/token-store.js'
import { loadConfig, saveConfig } from '../../config/loader.js'

export async function runAuthSetup(provider: string): Promise<void> {
  const rl = createInterface({ input, output })
  try {
    const config = loadConfig()

    if (provider === 'openai') {
      process.stdout.write(
        '\nOpenAI OAuth App Setup\n' +
        '──────────────────────────────────────────────\n' +
        'You need to register an OAuth app with OpenAI.\n\n' +
        '1. Go to: https://platform.openai.com/settings/organization/general\n' +
        '2. Scroll to "OAuth apps" and click "Create new OAuth app"\n' +
        '3. Set the redirect URI to: http://localhost:<any-port>/callback\n' +
        '   (adversarial-mirror picks a free port automatically)\n' +
        '4. Copy the Client ID\n\n'
      )
      const clientId = await askRequired(rl, 'Paste your OpenAI OAuth Client ID: ')
      saveConfig({
        ...config,
        oauthApps: { ...config.oauthApps, openaiClientId: clientId },
      })
      process.stdout.write('Saved. Run: mirror auth login openai\n')

    } else if (provider === 'gemini') {
      process.stdout.write(
        '\nGemini OAuth App Setup\n' +
        '──────────────────────────────────────────────\n' +
        'You need a Google Cloud OAuth app.\n\n' +
        '1. Go to: https://console.cloud.google.com/apis/credentials\n' +
        '2. Click "Create credentials" → "OAuth client ID"\n' +
        '3. Application type: Desktop app\n' +
        '4. Name it anything (e.g. adversarial-mirror)\n' +
        '5. Click Create — Google shows you a Client ID and Client Secret\n' +
        '6. Also enable the Generative Language API:\n' +
        '   https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com\n\n'
      )
      const clientId = await askRequired(rl, 'Paste your Google OAuth Client ID: ')
      const clientSecret = await askRequired(rl, 'Paste your Google OAuth Client Secret: ')
      saveConfig({
        ...config,
        oauthApps: { ...config.oauthApps, geminiClientId: clientId, geminiClientSecret: clientSecret },
      })
      process.stdout.write('Saved. Run: mirror auth login gemini\n')

    } else {
      process.stderr.write(
        `OAuth setup not available for: ${provider}\nSupported: openai, gemini\n`
      )
      process.exit(1)
    }
  } catch (error) {
    process.stderr.write(`Setup failed: ${(error as Error).message}\n`)
    process.exit(1)
  } finally {
    rl.close()
  }
}

export async function runAuthLogin(provider: string): Promise<void> {
  try {
    switch (provider) {
      case 'openai':
        await loginOpenAI()
        break
      case 'gemini':
        await loginGemini()
        break
      default:
        process.stderr.write(
          `OAuth not supported for: ${provider}\nSupported providers: openai, gemini\n`
        )
        process.exit(1)
    }
  } catch (error) {
    process.stderr.write(`Login failed: ${(error as Error).message}\n`)
    process.exit(1)
  }
}

export function runAuthLogout(provider: string): void {
  deleteTokens(provider)
  process.stdout.write(`Logged out of ${provider}.\n`)
}

export function runAuthStatus(): void {
  const providers = allProviders()
  if (providers.length === 0) {
    process.stdout.write('No active OAuth sessions.\n')
    return
  }
  for (const provider of providers) {
    const tokens = loadTokens(provider)
    if (!tokens) continue
    const expired = tokens.expiresAt !== undefined && Date.now() > tokens.expiresAt
    const status = expired ? 'expired' : 'active'
    const expiry = tokens.expiresAt
      ? `  (expires ${new Date(tokens.expiresAt).toLocaleString()})`
      : ''
    process.stdout.write(`${provider.padEnd(10)} ${status}${expiry}\n`)
  }
}

async function askRequired(
  rl: ReturnType<typeof createInterface>,
  prompt: string
): Promise<string> {
  const answer = (await rl.question(prompt)).trim()
  if (answer) return answer
  return askRequired(rl, prompt)
}
