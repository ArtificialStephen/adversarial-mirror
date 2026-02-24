import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createAdapter } from '../../brains/factory.js'
import { loadConfig, saveConfig } from '../../config/loader.js'
import type { BrainConfig } from '../../config/schema.js'

export function runBrainsList(): void {
  const config = loadConfig()
  const lines = config.brains.map(
    (brain) =>
      `${brain.id}\t${brain.provider}\t${brain.model}\t${brain.apiKeyEnvVar}`
  )

  if (lines.length === 0) {
    process.stdout.write('No brains configured.\n')
    return
  }

  process.stdout.write('ID\tPROVIDER\tMODEL\tAPI_KEY_ENV\n')
  process.stdout.write(`${lines.join('\n')}\n`)
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
      'Provider (anthropic|openai|gemini|mock): '
    )) as BrainConfig['provider']

    if (!['anthropic', 'openai', 'gemini', 'mock'].includes(provider)) {
      throw new Error(`Unsupported provider: ${provider}`)
    }

    const model = await askRequired(rl, 'Model name: ')
    const suggestedEnv = defaultEnvVar(provider)
    const apiKeyEnvVar = await askRequired(
      rl,
      `API key env var (${suggestedEnv}): `,
      suggestedEnv
    )

    const next: BrainConfig = {
      id,
      provider,
      model,
      apiKeyEnvVar
    }

    saveConfig({
      ...config,
      brains: [...config.brains, next]
    })

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
  if (answer) {
    return answer
  }
  if (fallback) {
    return fallback
  }
  return askRequired(rl, prompt, fallback)
}

function defaultEnvVar(provider: BrainConfig['provider']): string {
  switch (provider) {
    case 'anthropic':
      return 'ANTHROPIC_API_KEY'
    case 'openai':
      return 'OPENAI_API_KEY'
    case 'gemini':
      return 'GOOGLE_API_KEY'
    case 'mock':
      return 'MOCK_API_KEY'
    default:
      return 'API_KEY'
  }
}
