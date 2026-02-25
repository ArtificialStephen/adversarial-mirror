import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { Command } from 'commander'
import { createAdapter } from '../../brains/factory.js'
import { loadConfig } from '../../config/loader.js'
import { buildIntentClassifier } from '../../engine/classifier-factory.js'
import { MirrorEngine } from '../../engine/mirror-engine.js'
import { Session } from '../../engine/session.js'
import { addHistoryEntry } from '../../history/store.js'
import type { BrainResult, IntentResult } from '../../types/index.js'

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    process.stdin.on('error', reject)
  })
}

// Commander v12: for "mirror <question>", the action receives (question, localOpts, command).
// Global flags live on command.parent.opts().
export async function runMirror(
  question: string,
  _localOpts: Record<string, unknown>,
  command: Command
): Promise<void> {
  // Merge parent (global) opts with local command opts
  const parentOpts = command.parent?.opts() ?? {}
  const localOpts = command.opts()
  const opts = { ...parentOpts, ...localOpts }

  try {
    const config = loadConfig()
    const originalId =
      (opts['original'] as string | undefined) ?? config.session.originalBrainId
    const challengerId =
      (opts['challenger'] as string | undefined) ?? config.session.challengerBrainId
    const intensity =
      (opts['intensity'] as string | undefined) ?? config.session.defaultIntensity
    const mirrorEnabled = opts['mirror'] !== false
    const classifyEnabled = opts['classify'] !== false
    const judgeEnabled = opts['judge'] !== false && config.session.judgeEnabled
    const persona = (opts['persona'] as string | undefined) ?? config.session.defaultPersona
    const filePath = opts['file'] as string | undefined

    // Build file context prefix
    let filePrefix = ''
    if (filePath) {
      try {
        const content = readFileSync(filePath, 'utf8')
        const name = basename(filePath)
        filePrefix = `[FILE: ${name}]\n${content}\n\n---\n`
      } catch (err) {
        throw new Error(`Could not read file: ${filePath} — ${(err as Error).message}`)
      }
    } else if (!process.stdin.isTTY) {
      // Piped stdin
      const content = await readStdin()
      if (content.trim()) {
        filePrefix = `[STDIN]\n${content}\n\n---\n`
      }
    }

    const fullQuestion = filePrefix ? `${filePrefix}${question}` : question

    const originalConfig = config.brains.find(b => b.id === originalId)
    if (!originalConfig) throw new Error(`Original brain not found: ${originalId}`)

    const originalAdapter = createAdapter(originalConfig)
    const challengerConfig = config.brains.find(b => b.id === challengerId)
    const challengerAdapter =
      mirrorEnabled && challengerConfig ? createAdapter(challengerConfig) : undefined

    // Build judge adapter
    let judgeAdapter = undefined
    if (mirrorEnabled && challengerAdapter && judgeEnabled) {
      const judgeId = (opts['judgeBrain'] as string | undefined) ?? config.session.judgeBrainId
      const judgeConfig = config.brains.find(b => b.id === judgeId)
      if (judgeConfig) {
        judgeAdapter = createAdapter(judgeConfig)
      }
    }

    const classifier = buildIntentClassifier(config, Boolean(opts['debug']))
    const engine = new MirrorEngine({
      original: originalAdapter,
      challenger: challengerAdapter,
      intensity: intensity as 'mild' | 'moderate' | 'aggressive',
      autoClassify: mirrorEnabled && classifyEnabled,
      classifier,
      debug: Boolean(opts['debug']),
      judge: judgeAdapter,
      persona,
    })

    const session = new Session(1)
    const results = new Map<string, BrainResult>()
    let intentResult: IntentResult | undefined
    const entryId = randomUUID()
    const createdAt = new Date().toISOString()
    const startTimes = new Map<string, number>([
      [originalAdapter.id, Date.now()],
      ...(challengerAdapter ? [[challengerAdapter.id, Date.now()] as [string, number]] : []),
    ])

    // Stream the original response in real time. Buffer the challenger so the
    // two parallel streams don't interleave into unreadable output.
    let originalHeaderPrinted = false
    let synthBuffer = ''
    let synthScore: number | undefined

    for await (const event of engine.run(fullQuestion, session.getHistory())) {
      if (event.type === 'classifying') {
        process.stdout.write('Classifying...\n')
      }

      if (event.type === 'classified') {
        const label = event.result.shouldMirror ? 'MIRRORING' : 'DIRECT'
        process.stdout.write(
          `[${label}] ${event.result.category} (${Math.round(event.result.confidence * 100)}%)\n`
        )
        intentResult = event.result
      }

      if (event.type === 'stream_chunk' && !event.chunk.isFinal) {
        if (event.brainId === originalAdapter.id) {
          if (!originalHeaderPrinted) {
            process.stdout.write(`\nORIGINAL (${originalAdapter.id})\n`)
            originalHeaderPrinted = true
          }
          process.stdout.write(event.chunk.delta)
        }
        // Challenger chunks are buffered; we print the complete text after brain_complete.
      }

      if (event.type === 'brain_complete') {
        const latency = Date.now() - (startTimes.get(event.brainId) ?? Date.now())
        results.set(event.brainId, {
          brainId: event.brainId,
          text: event.response.text,
          inputTokens: event.response.inputTokens,
          outputTokens: event.response.outputTokens,
          latencyMs: latency,
        })
      }

      if (event.type === 'synthesizing') {
        // Ensure original output ends with a newline before challenger block.
        if (originalHeaderPrinted) process.stdout.write('\n')
        if (challengerAdapter) {
          const challengerResult = results.get(challengerAdapter.id)
          process.stdout.write(`\nCHALLENGER (${challengerAdapter.id})\n`)
          process.stdout.write(`${challengerResult?.text ?? ''}\n`)
        }
        process.stdout.write('\nSYNTHESIS (judge)\n')
      }

      if (event.type === 'synthesis_chunk' && !event.chunk.isFinal) {
        synthBuffer += event.chunk.delta
        process.stdout.write(event.chunk.delta)
      }

      if (event.type === 'synthesis_complete') {
        synthScore = event.result.agreementScore
        process.stdout.write('\n')
        if (synthScore !== undefined) {
          process.stdout.write(`\nAgreement score: ${synthScore}%\n`)
        }
      }

      if (event.type === 'all_complete') {
        // Print challenger if judge pass didn't already do it
        if (!judgeAdapter) {
          if (originalHeaderPrinted) process.stdout.write('\n')
          if (challengerAdapter) {
            const challengerResult = results.get(challengerAdapter.id)
            process.stdout.write(`\nCHALLENGER (${challengerAdapter.id})\n`)
            process.stdout.write(`${challengerResult?.text ?? ''}\n`)
          }
        }
      }

      if (event.type === 'error') throw event.error
    }

    const originalResult = results.get(originalAdapter.id)
    if (originalResult) {
      addHistoryEntry({
        id: entryId,
        createdAt,
        question: fullQuestion,
        original: originalResult,
        challenger: challengerAdapter ? results.get(challengerAdapter.id) : undefined,
        intent: intentResult,
      })
    }
  } catch (error) {
    process.stderr.write(`Failed to run mirror: ${(error as Error).message}\n`)
    process.exit(1)
  }
}
