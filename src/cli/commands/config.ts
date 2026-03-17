import { execFile } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { promisify } from 'node:util'
import { loadConfig, saveConfig, setConfigValue } from '../../config/loader.js'
import type { AppConfig } from '../../config/schema.js'
import { buildExportLines, detectShellProfile } from '../utils/shell.js'
import { hasTokens } from '../../auth/token-store.js'
import { loginOpenAI } from '../../auth/openai-oauth.js'
import { loginGemini } from '../../auth/gemini-oauth.js'

const execFileAsync = promisify(execFile)

export function runConfigShow(): void {
  const config = loadConfig()
  process.stdout.write(JSON.stringify(config, null, 2))
  process.stdout.write('\n')
}

export async function runConfigInit(): Promise<void> {
  const rl = createInterface({ input, output })

  try {
    const config = loadConfig()
    if (config.brains.length === 0) {
      throw new Error('No brains configured. Run mirror brains add first.')
    }

    const availableBrains = config.brains.map((brain) => brain.id).join(', ')

    // ─── Session Settings ────────────────────────────────────────────────────
    process.stdout.write('\n── Session ──────────────────────────────────\n')

    const originalBrainId = await askRequired(
      rl,
      `Original brain (${availableBrains}) [${config.session.originalBrainId}]: `,
      config.session.originalBrainId
    )
    if (!config.brains.some((brain) => brain.id === originalBrainId)) {
      throw new Error(`Unknown brain id: ${originalBrainId}`)
    }

    const challengerBrainId = await askRequired(
      rl,
      `Challenger brain (${availableBrains}) [${config.session.challengerBrainId}]: `,
      config.session.challengerBrainId
    )
    if (!config.brains.some((brain) => brain.id === challengerBrainId)) {
      throw new Error(`Unknown brain id: ${challengerBrainId}`)
    }

    const intensity = (await askRequired(
      rl,
      `Default intensity (mild|moderate|aggressive) [${config.session.defaultIntensity}]: `,
      config.session.defaultIntensity
    )) as AppConfig['session']['defaultIntensity']
    if (!['mild', 'moderate', 'aggressive'].includes(intensity)) {
      throw new Error(`Invalid intensity: ${intensity}`)
    }

    const autoClassify = await askYesNo(
      rl,
      `Auto-classify intent? (y/n) [${config.session.autoClassify ? 'y' : 'n'}]: `,
      config.session.autoClassify
    )

    const historyWindowSize = Number(
      await askRequired(
        rl,
        `History window size [${config.session.historyWindowSize}]: `,
        String(config.session.historyWindowSize)
      )
    )
    if (!Number.isInteger(historyWindowSize) || historyWindowSize <= 0) {
      throw new Error('History window size must be a positive integer.')
    }

    // ─── Judge Settings ───────────────────────────────────────────────────────
    process.stdout.write('\n── Judge ────────────────────────────────────\n')

    const judgeEnabled = await askYesNo(
      rl,
      `Enable synthesis judge? (y/n) [${config.session.judgeEnabled ? 'y' : 'n'}]: `,
      config.session.judgeEnabled
    )

    let judgeBrainId = config.session.judgeBrainId
    if (judgeEnabled) {
      judgeBrainId = await askRequired(
        rl,
        `Judge brain (${availableBrains}) [${config.session.judgeBrainId}]: `,
        config.session.judgeBrainId
      )
      if (!config.brains.some((brain) => brain.id === judgeBrainId)) {
        throw new Error(`Unknown brain id: ${judgeBrainId}`)
      }
    }

    // ─── Persona Settings ─────────────────────────────────────────────────────
    process.stdout.write('\n── Persona ──────────────────────────────────\n')

    const personaNames = 'vc-skeptic|security-auditor|end-user|regulator|contrarian'
    const currentPersona = config.session.defaultPersona ?? 'none'
    const personaAnswer = await askOptional(
      rl,
      `Default persona (${personaNames}|none) [${currentPersona}]: `,
      currentPersona
    )
    const defaultPersona = (personaAnswer === 'none' || !personaAnswer) ? undefined : personaAnswer

    // ─── Display Settings ─────────────────────────────────────────────────────
    process.stdout.write('\n── Display ──────────────────────────────────\n')

    const layout = (await askRequired(
      rl,
      `Layout (side-by-side|stacked) [${config.ui.layout}]: `,
      config.ui.layout
    )) as AppConfig['ui']['layout']
    if (!['side-by-side', 'stacked'].includes(layout)) {
      throw new Error(`Invalid layout: ${layout}`)
    }

    const showTokenCounts = await askYesNo(
      rl,
      `Show token counts? (y/n) [${config.ui.showTokenCounts ? 'y' : 'n'}]: `,
      config.ui.showTokenCounts
    )

    const showLatency = await askYesNo(
      rl,
      `Show latency? (y/n) [${config.ui.showLatency ? 'y' : 'n'}]: `,
      config.ui.showLatency
    )

    const syntaxHighlighting = await askYesNo(
      rl,
      `Syntax highlighting? (y/n) [${config.ui.syntaxHighlighting ? 'y' : 'n'}]: `,
      config.ui.syntaxHighlighting
    )

    // ─── API Keys ─────────────────────────────────────────────────────────────
    const keyBrains = config.brains.filter(b => b.authType !== 'oauth')
    if (keyBrains.length > 0) {
      process.stdout.write('\n── API Keys ─────────────────────────────────\n')
      const updatedKeys = await promptForApiKeys(rl, config)
      if (Object.keys(updatedKeys).length > 0) {
        const persist = await askYesNo(
          rl,
          'Persist API keys to environment variables? (y/n) [y]: ',
          true
        )
        if (persist) {
          await persistEnvVars(updatedKeys, rl)
          process.stdout.write(
            'Keys saved. Open a new terminal session to pick them up.\n'
          )
        }
      }
      await validateGeminiModels(rl, config, updatedKeys)
    }

    // ─── OAuth Sessions ───────────────────────────────────────────────────────
    const oauthBrains = config.brains.filter(
      b => b.authType === 'oauth' && (b.provider === 'openai' || b.provider === 'gemini')
    )
    if (oauthBrains.length > 0) {
      process.stdout.write('\n── OAuth Sessions ───────────────────────────\n')
      for (const brain of oauthBrains) {
        const provider = brain.provider as 'openai' | 'gemini'
        const active = hasTokens(provider)
        process.stdout.write(
          `${brain.id} (${provider})  ${active ? '✓ logged in' : '✗ not logged in'}\n`
        )
        if (!active) {
          const doLogin = await askYesNo(
            rl,
            `Log in to ${provider} now? (y/n) [y]: `,
            true
          )
          if (doLogin) {
            rl.close()
            if (provider === 'openai') await loginOpenAI()
            else await loginGemini()
            return
          }
        }
      }
    }

    // ─── Save ─────────────────────────────────────────────────────────────────
    saveConfig({
      ...config,
      session: {
        ...config.session,
        originalBrainId,
        challengerBrainId,
        defaultIntensity: intensity,
        historyWindowSize,
        autoClassify,
        judgeEnabled,
        judgeBrainId,
        defaultPersona,
      },
      ui: {
        ...config.ui,
        layout,
        showTokenCounts,
        showLatency,
        syntaxHighlighting
      }
    })

    process.stdout.write('\nConfig saved.\n')
  } catch (error) {
    process.stderr.write(
      `Failed to initialize config: ${(error as Error).message}\n`
    )
    process.exit(1)
  } finally {
    rl.close()
  }
}

export function runConfigSet(key: string, value: string): void {
  try {
    const parsed = parseValue(value)
    const updated = setConfigValue(key, parsed)
    process.stdout.write(JSON.stringify(updated, null, 2))
    process.stdout.write('\n')
  } catch (error) {
    process.stderr.write(`Failed to set config: ${(error as Error).message}\n`)
    process.exit(1)
  }
}

function parseValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) {
    return value
  }

  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (!Number.isNaN(Number(trimmed))) return Number(trimmed)

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
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

async function askOptional(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  fallback: string
): Promise<string> {
  const answer = (await rl.question(prompt)).trim()
  return answer || fallback
}

async function askYesNo(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  fallback: boolean
): Promise<boolean> {
  const answer = (await rl.question(prompt)).trim().toLowerCase()
  if (!answer) {
    return fallback
  }
  if (['y', 'yes'].includes(answer)) {
    return true
  }
  if (['n', 'no'].includes(answer)) {
    return false
  }
  return askYesNo(rl, prompt, fallback)
}

async function promptForApiKeys(
  rl: ReturnType<typeof createInterface>,
  config: AppConfig
): Promise<Record<string, string>> {
  const updated: Record<string, string> = {}
  const keyBrains = config.brains.filter(b => b.authType !== 'oauth' && b.apiKeyEnvVar)
  const uniqueEnvVars = Array.from(
    new Set(keyBrains.map((brain) => brain.apiKeyEnvVar as string))
  )

  for (const envVar of uniqueEnvVars) {
    const alreadySet = Boolean(process.env[envVar])
    const shouldSet = await askYesNo(
      rl,
      `${envVar} ${alreadySet ? '(already set)' : '(missing)'} — set now? (y/n) [${
        alreadySet ? 'n' : 'y'
      }]: `,
      !alreadySet
    )
    if (!shouldSet) {
      continue
    }

    const secret = await askSecret(rl, `Enter value for ${envVar}: `)
    if (!secret) {
      continue
    }
    process.env[envVar] = secret
    updated[envVar] = secret
  }

  return updated
}

async function askSecret(
  rl: ReturnType<typeof createInterface>,
  prompt: string
): Promise<string> {
  if (!input.isTTY) {
    return askRequired(rl, prompt)
  }

  output.write(prompt)
  rl.pause()
  input.setRawMode(true)
  input.resume()

  let value = ''

  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      const char = chunk.toString()
      if (char === '\r' || char === '\n') {
        input.setRawMode(false)
        input.pause()
        input.removeListener('data', onData)
        output.write('\n')
        rl.resume()
        resolve(value)
        return
      }
      if (char === '\u0003') {
        process.exit(1)
      }
      if (char === '\u0008' || char === '\u007f') {
        value = value.slice(0, -1)
        return
      }
      value += char
    }

    input.on('data', onData)
  })
}

async function persistEnvVars(
  vars: Record<string, string>,
  rl: ReturnType<typeof createInterface>
): Promise<void> {
  if (process.platform === 'win32') {
    for (const [key, value] of Object.entries(vars)) {
      await execFileAsync('setx', [key, value])
    }
    return
  }

  const profile = detectShellProfile()
  const lines = buildExportLines(vars, profile)
  const isFish = profile.endsWith('config.fish')

  process.stdout.write(`\nDetected shell profile: ${profile}\n`)
  process.stdout.write('Add the following to your shell profile:\n\n')
  for (const line of lines) {
    process.stdout.write(`  ${line}\n`)
  }
  process.stdout.write('\n')

  if (isFish) {
    process.stdout.write(
      'Fish tip: run those commands directly in your terminal — `set -Ux` persists automatically across sessions.\n'
    )
    return
  }

  const write = await askYesNo(
    rl,
    `Append these lines to ${profile} automatically? (y/n) [y]: `,
    true
  )
  if (write) {
    const content = '\n# adversarial-mirror API keys\n' + lines.join('\n') + '\n'
    appendFileSync(profile, content, 'utf8')
    process.stdout.write(`Appended to ${profile}.\n`)
  }
}

async function validateGeminiModels(
  rl: ReturnType<typeof createInterface>,
  config: AppConfig,
  updatedKeys: Record<string, string>
): Promise<void> {
  // Only validate key-auth gemini brains
  const geminiBrains = config.brains.filter(
    (brain) => brain.provider === 'gemini' && brain.authType !== 'oauth'
  )
  if (geminiBrains.length === 0) {
    return
  }

  const geminiEnvVar = geminiBrains[0].apiKeyEnvVar
  if (!geminiEnvVar) return
  const apiKey = updatedKeys[geminiEnvVar] ?? process.env[geminiEnvVar]
  if (!apiKey) {
    return
  }

  const shouldCheck = await askYesNo(
    rl,
    'Check Gemini model availability now? (y/n) [y]: ',
    true
  )
  if (!shouldCheck) {
    return
  }

  try {
    const models = await listGeminiModels(apiKey)
    const supported = models.filter((model) =>
      model.supportedGenerationMethods.some((method) =>
        ['generateContent', 'streamGenerateContent'].includes(method)
      )
    )

    for (const brain of geminiBrains) {
      const exists = supported.some((model) => model.name.endsWith(`/${brain.model}`))
      if (exists) {
        continue
      }
      process.stdout.write(
        `Gemini model not found for ${brain.id}: ${brain.model}\n`
      )
      const suggestion = supported.find((model) =>
        model.name.endsWith('/gemini-2.5-pro')
      )
      const recommended = suggestion?.name.split('/').pop() ?? 'gemini-2.5-pro'
      const nextModel = await askRequired(
        rl,
        `Enter a supported Gemini model [${recommended}]: `,
        recommended
      )
      brain.model = nextModel
    }
  } catch (error) {
    process.stderr.write(
      `Failed to validate Gemini models: ${(error as Error).message}\n`
    )
  }
}

async function listGeminiModels(apiKey: string): Promise<GeminiModel[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  )
  if (!res.ok) {
    throw new Error(`Gemini ListModels failed: ${res.status}`)
  }
  const data = (await res.json()) as { models?: GeminiModel[] }
  return data.models ?? []
}

interface GeminiModel {
  name: string
  supportedGenerationMethods: string[]
}
