import type { Command } from 'commander'
import { createAdapter } from '../../brains/factory.js'
import { loadConfig } from '../../config/loader.js'
import { HeuristicIntentClassifier } from '../../engine/intent-classifier.js'
import { MirrorEngine } from '../../engine/mirror-engine.js'
import { Session } from '../../engine/session.js'

export async function runMirror(
  question: string,
  command: Command
): Promise<void> {
  const opts = command.parent?.opts() ?? {}

  try {
    const config = loadConfig()
    const originalId = (opts.original as string | undefined) ?? config.session.originalBrainId
    const challengerId =
      (opts.challenger as string | undefined) ?? config.session.challengerBrainId
    const intensity =
      (opts.intensity as string | undefined) ?? config.session.defaultIntensity
    const mirrorEnabled = opts.mirror !== false
    const classifyEnabled = opts.classify !== false

    const originalConfig = config.brains.find((brain) => brain.id === originalId)
    if (!originalConfig) {
      throw new Error(`Original brain not found: ${originalId}`)
    }

    const originalAdapter = createAdapter(originalConfig)
    const challengerConfig = config.brains.find(
      (brain) => brain.id === challengerId
    )
    const challengerAdapter =
      mirrorEnabled && challengerConfig
        ? createAdapter(challengerConfig)
        : undefined

    const classifier = new HeuristicIntentClassifier()
    const engine = new MirrorEngine({
      original: originalAdapter,
      challenger: challengerAdapter,
      intensity: intensity as 'mild' | 'moderate' | 'aggressive',
      autoClassify: mirrorEnabled && classifyEnabled,
      classifier
    })

    const session = new Session(1)
    const results = new Map<string, string>()
    let intentLine: string | null = null

    for await (const event of engine.run(question, session.getHistory())) {
      if (event.type === 'classified') {
        intentLine = `[${event.result.shouldMirror ? 'MIRRORING' : 'DIRECT'}] ${
          event.result.category
        } (${Math.round(event.result.confidence * 100)}%)`
      }

      if (event.type === 'stream_chunk') {
        const current = results.get(event.brainId) ?? ''
        results.set(event.brainId, `${current}${event.chunk.delta}`)
      }

      if (event.type === 'brain_complete') {
        results.set(event.brainId, event.response.text)
      }

      if (event.type === 'error') {
        throw event.error
      }
    }

    if (intentLine) {
      process.stdout.write(`${intentLine}\n`)
    }

    const originalText = results.get(originalAdapter.id) ?? ''
    process.stdout.write(`\nORIGINAL (${originalAdapter.id})\n`)
    process.stdout.write(`${originalText}\n`)

    if (challengerAdapter) {
      const challengerText = results.get(challengerAdapter.id) ?? ''
      process.stdout.write(`\nCHALLENGER (${challengerAdapter.id})\n`)
      process.stdout.write(`${challengerText}\n`)
    }
  } catch (error) {
    process.stderr.write(
      `Failed to run mirror: ${(error as Error).message}\n`
    )
    process.exit(1)
  }
}
