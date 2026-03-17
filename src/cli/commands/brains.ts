import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createAdapter } from '../../brains/factory.js'
import { loadConfig, saveConfig } from '../../config/loader.js'
import type { BrainConfig } from '../../config/schema.js'
import { resolveOAuthTokens } from '../utils/resolve-tokens.js'
import { loadTokens } from '../../auth/token-store.js'

export function runBrainsList(): void {
  const config = loadConfig()
  if (config.brains.length === 0) {
    process.stdout.write('No brains configured.\n')
    return
  }

  const rows = config.brains.map(b => [
    b.id,
    b.provider,
    b.model,
    b.authType === 'oauth' ? 'oauth' : (b.apiKeyEnvVar ?? '—'),
  ])
  const headers = ['ID', 'PROVIDER', 'MODEL', 'AUTH']
  const all = [headers, ...rows]
  const widths = headers.map((_, i) => Math.max(...all.map(r => r[i].length)))
  const fmt = (row: string[]) => row.map((cell, i) => cell.padEnd(widths[i])).join('  ')

  process.stdout.write(fmt(headers) + '\n')
  process.stdout.write('─'.repeat(widths.reduce((a, b) => a + b, 0) + widths.length * 2) + '\n')
  for (const row of rows) {
    process.stdout.write(fmt(row) + '\n')
  }
}

export async function runBrainsTest(id: string): Promise<void> {
  try {
    const config = loadConfig()
    const brain = config.brains.find((entry) => entry.id === id)
    if (!brain) {
      throw new Error(`Brain not found: ${id}`)
    }

    const oauthTokens = await resolveOAuthTokens(config.brains)
    const adapter = createAdapter(brain, {}, oauthTokens)
    const result = await adapter.ping()
    if (!result.ok) {
      throw new Error(result.error ?? 'Ping failed')
    }

    process.stdout.write(
      `Brain ${id} ok${result.latencyMs ? ` (${result.latencyMs}ms)` : ''}\n`
    )
  } catch (error) {
    process.stderr.write(`Brain test failed: ${(error as Error).message}\n`)
    process.exit(1)
  }
}

export async function runBrainsAdd(): Promise<void> {
  const rl = createInterface({ input, output })

  try {
    const config = loadConfig()

    const id = await askRequired(rl, 'Brain id (unique): ')
    if (config.brains.some((brain) => brain.id === id)) {
      throw new Error(`Brain id already exists: ${id}`)
    }

    const provider = (await askRequired(
      rl,
      'Provider (anthropic|openai|gemini|ollama|mock): '
    )) as BrainConfig['provider']

    if (!['anthropic', 'openai', 'gemini', 'ollama', 'mock'].includes(provider)) {
      throw new Error(`Unsupported provider: ${provider}`)
    }

    let authType: BrainConfig['authType'] = 'key'
    let apiKeyEnvVar: string | undefined
    let baseUrl: string | undefined

    if (provider === 'openai' || provider === 'gemini') {
      const authAnswer = await askOptional(rl, 'Auth type (key|oauth) [key]: ', 'key')
      authType = (authAnswer === 'oauth' ? 'oauth' : 'key') as BrainConfig['authType']
    }

    if (authType === 'key' && provider !== 'ollama' && provider !== 'mock') {
      const suggestedEnv = defaultEnvVar(provider)
      apiKeyEnvVar = await askRequired(rl, `API key env var (${suggestedEnv}): `, suggestedEnv)
    }

    if (provider === 'ollama') {
      const ans = (await rl.question('Base URL [http://localhost:11434]: ')).trim()
      if (ans) baseUrl = ans
    }

    // Try to fetch available models and let the user pick
    const model = await pickModel(rl, provider, authType, apiKeyEnvVar)

    const next: BrainConfig = { id, provider, model, authType, apiKeyEnvVar, baseUrl }
    saveConfig({ ...config, brains: [...config.brains, next] })
    process.stdout.write(`Added brain ${id}.\n`)
  } catch (error) {
    process.stderr.write(`Failed to add brain: ${(error as Error).message}\n`)
    process.exit(1)
  } finally {
    rl.close()
  }
}

async function pickModel(
  rl: ReturnType<typeof createInterface>,
  provider: BrainConfig['provider'],
  authType: BrainConfig['authType'],
  apiKeyEnvVar?: string
): Promise<string> {
  process.stdout.write('Fetching available models...\n')

  try {
    const models = await fetchModels(provider, authType, apiKeyEnvVar)
    if (models.length === 0) throw new Error('No models returned')

    process.stdout.write('\n')
    models.forEach((m, i) => process.stdout.write(`  ${String(i + 1).padStart(2)}.  ${m}\n`))
    process.stdout.write('\n')

    const answer = (await rl.question('Pick a model (number or name): ')).trim()
    const idx = Number(answer)
    if (!isNaN(idx) && idx >= 1 && idx <= models.length) {
      return models[idx - 1]
    }
    if (answer) return answer
    return models[0]
  } catch {
    // Fetch failed — fall back to manual entry
    return askRequired(rl, 'Model name: ')
  }
}

async function fetchModels(
  provider: BrainConfig['provider'],
  authType: BrainConfig['authType'],
  apiKeyEnvVar?: string
): Promise<string[]> {
  if (provider === 'openai') {
    const token = authType === 'oauth'
      ? loadTokens('openai')?.accessToken
      : (apiKeyEnvVar ? process.env[apiKeyEnvVar] : undefined)
    if (!token) throw new Error('No credentials')

    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`${res.status}`)
    const data = await res.json() as { data: { id: string; created: number }[] }
    return data.data
      .filter(m => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !m.id.includes('instruct') && !m.id.includes('realtime') && !m.id.includes('audio'))
      .sort((a, b) => b.created - a.created)
      .map(m => m.id)
  }

  if (provider === 'gemini') {
    const token = authType === 'oauth'
      ? loadTokens('gemini')?.accessToken
      : undefined
    const apiKey = authType === 'key' && apiKeyEnvVar ? process.env[apiKeyEnvVar] : undefined

    const url = token
      ? 'https://generativelanguage.googleapis.com/v1beta/models'
      : `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {}

    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`${res.status}`)
    const data = await res.json() as { models: { name: string; supportedGenerationMethods: string[] }[] }
    return data.models
      .filter(m => m.supportedGenerationMethods.includes('streamGenerateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(m => !m.includes('embedding') && !m.includes('aqa'))
      .sort((a, b) => b.localeCompare(a))
  }

  if (provider === 'anthropic') {
    // Anthropic doesn't have a public list endpoint — return known models
    return [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
    ]
  }

  throw new Error('No model list available')
}

async function askRequired(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  fallback?: string
): Promise<string> {
  const answer = (await rl.question(prompt)).trim()
  if (answer) return answer
  if (fallback) return fallback
  return askRequired(rl, prompt, fallback)
}

async function askOptional(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  fallback: string
): Promise<string> {
  const answer = (await rl.question(prompt)).trim()
  return answer || fallback
}

function defaultEnvVar(provider: BrainConfig['provider']): string {
  switch (provider) {
    case 'anthropic': return 'ANTHROPIC_API_KEY'
    case 'openai':    return 'OPENAI_API_KEY'
    case 'gemini':    return 'GOOGLE_API_KEY'
    default:          return 'API_KEY'
  }
}
