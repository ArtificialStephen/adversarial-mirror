import { randomUUID } from 'node:crypto'
import type { Command } from 'commander'
import { createAdapter } from '../../brains/factory.js'
import { loadConfig } from '../../config/loader.js'
import { buildIntentClassifier } from '../../engine/classifier-factory.js'
import { MirrorEngine } from '../../engine/mirror-engine.js'
import { Session } from '../../engine/session.js'
import { addHistoryEntry } from '../../history/store.js'
import type { BrainResult, IntentResult } from '../../types/index.js'

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

    const classifier = buildIntentClassifier(config, Boolean(opts.debug))
    const engine = new MirrorEngine({
      original: originalAdapter,
      challenger: challengerAdapter,
      intensity: intensity as 'mild' | 'moderate' | 'aggressive',
      autoClassify: mirrorEnabled && classifyEnabled,
      classifier,
      debug: Boolean(opts.debug)
    })

    const session = new Session(1)
    const results = new Map<string, BrainResult>()
    let intentLine: string | null = null
    let intentResult: IntentResult | undefined
    const entryId = randomUUID()
    const createdAt = new Date().toISOString()
    const startTimes = new Map<string, number>()
    startTimes.set(originalAdapter.id, Date.now())
    if (challengerAdapter) {
      startTimes.set(challengerAdapter.id, Date.now())
    }

    for await (const event of engine.run(question, session.getHistory())) {
      if (event.type === 'classified') {
        intentLine = `[${event.result.shouldMirror ? 'MIRRORING' : 'DIRECT'}] ${
          event.result.category
        } (${Math.round(event.result.confidence * 100)}%)`
        intentResult = event.result
      }

      if (event.type === 'stream_chunk') {
        const current = results.get(event.brainId)
        const text = `${current?.text ?? ''}${event.chunk.delta}`
        results.set(event.brainId, {
          brainId: event.brainId,
          text,
          inputTokens: current?.inputTokens,
          outputTokens: current?.outputTokens,
          latencyMs: current?.latencyMs
        })
      }

      if (event.type === 'brain_complete') {
        const latency =
          Date.now() - (startTimes.get(event.brainId) ?? Date.now())
        results.set(event.brainId, {
          brainId: event.brainId,
          text: event.response.text,
          inputTokens: event.response.inputTokens,
          outputTokens: event.response.outputTokens,
          latencyMs: latency
        })
      }

      if (event.type === 'error') {
        throw event.error
      }
    }

    if (intentLine) {
      process.stdout.write(`${intentLine}\n`)
    }

    const originalResult = results.get(originalAdapter.id)
    const originalText = originalResult?.text ?? ''
    process.stdout.write(`\nORIGINAL (${originalAdapter.id})\n`)
    process.stdout.write(`${originalText}\n`)

    if (challengerAdapter) {
      const challengerResult = results.get(challengerAdapter.id)
      const challengerText = challengerResult?.text ?? ''
      process.stdout.write(`\nCHALLENGER (${challengerAdapter.id})\n`)
      process.stdout.write(`${challengerText}\n`)
    }

    if (originalResult) {
      addHistoryEntry({
        id: entryId,
        createdAt,
        question,
        original: originalResult,
        challenger: challengerAdapter ? results.get(challengerAdapter.id) : undefined,
        intent: intentResult
      })
    }
  } catch (error) {
    process.stderr.write(
      `Failed to run mirror: ${(error as Error).message}\n`
    )
    process.exit(1)
  }
}
