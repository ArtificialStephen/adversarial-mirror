import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { loadConfig, saveConfig, setConfigValue } from '../../config/loader.js'
import type { AppConfig } from '../../config/schema.js'

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
    const intensity = (await askRequired(
      rl,
      `Default intensity (mild|moderate|aggressive) [${config.session.defaultIntensity}]: `,
      config.session.defaultIntensity
    )) as AppConfig['session']['defaultIntensity']

    if (!['mild', 'moderate', 'aggressive'].includes(intensity)) {
      throw new Error(`Invalid intensity: ${intensity}`)
    }

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

    const availableBrains = config.brains.map((brain) => brain.id).join(', ')
    const originalBrainId = await askRequired(
      rl,
      `Original brain id (${availableBrains}) [${config.session.originalBrainId}]: `,
      config.session.originalBrainId
    )

    const challengerBrainId = await askRequired(
      rl,
      `Challenger brain id (${availableBrains}) [${config.session.challengerBrainId}]: `,
      config.session.challengerBrainId
    )

    if (!config.brains.some((brain) => brain.id === originalBrainId)) {
      throw new Error(`Unknown original brain id: ${originalBrainId}`)
    }
    if (!config.brains.some((brain) => brain.id === challengerBrainId)) {
      throw new Error(`Unknown challenger brain id: ${challengerBrainId}`)
    }

    saveConfig({
      ...config,
      session: {
        ...config.session,
        originalBrainId,
        challengerBrainId,
        defaultIntensity: intensity,
        historyWindowSize,
        autoClassify
      },
      ui: {
        ...config.ui,
        layout,
        showTokenCounts,
        showLatency,
        syntaxHighlighting
      }
    })

    process.stdout.write('Config saved.\n')
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
