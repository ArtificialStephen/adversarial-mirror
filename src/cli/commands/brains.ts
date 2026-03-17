import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createAdapter } from '../../brains/factory.js'
import { loadConfig, saveConfig } from '../../config/loader.js'
import type { BrainConfig } from '../../config/schema.js'

export function runBrainsList(): void {
  const config = loadConfig()
  if (config.brains.length === 0) {
    process.stdout.write('No brains configured.\n')
    return
  }

  const rows = config.brains.map(b => [b.id, b.provider, b.model, b.apiKeyEnvVar ?? '—'])
  const headers = ['ID', 'PROVIDER', 'MODEL', 'API_KEY_ENV']
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

    const adapter = createAdapter(brain)
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

    const model = await askRequired(rl, 'Model name: ')

    let apiKeyEnvVar: string | undefined
    if (provider !== 'ollama' && provider !== 'mock') {
      const suggestedEnv = defaultEnvVar(provider)
      apiKeyEnvVar = await askRequired(rl, `API key env var (${suggestedEnv}): `, suggestedEnv)
    }

    let baseUrl: string | undefined
    if (provider === 'ollama') {
      const ans = (await rl.question('Base URL [http://localhost:11434]: ')).trim()
      if (ans) baseUrl = ans
    }

    const next: BrainConfig = { id, provider, model, apiKeyEnvVar, baseUrl }

    saveConfig({ ...config, brains: [...config.brains, next] })
    process.stdout.write(`Added brain ${id}.\n`)
  } catch (error) {
    process.stderr.write(`Failed to add brain: ${(error as Error).message}\n`)
    process.exit(1)
  } finally {
    rl.close()
  }
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

function defaultEnvVar(provider: BrainConfig['provider']): string {
  switch (provider) {
    case 'anthropic': return 'ANTHROPIC_API_KEY'
    case 'openai':    return 'OPENAI_API_KEY'
    case 'gemini':    return 'GOOGLE_API_KEY'
    default:          return 'API_KEY'
  }
}
