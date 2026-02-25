import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import React from 'react'
import type { Command } from 'commander'
import { render } from 'ink'
import { createAdapter } from '../../brains/factory.js'
import { loadConfig } from '../../config/loader.js'
import { buildIntentClassifier } from '../../engine/classifier-factory.js'
import { MirrorEngine } from '../../engine/mirror-engine.js'
import { Session } from '../../engine/session.js'
import { MirrorApp } from '../../ui/mirror-app.js'

// Commander v12 passes (localOptions, command) for commands with no positional args.
// Global flags live on command.parent.opts() — reading from localOptions would always be {}.
export function runChat(_localOpts: Record<string, unknown>, command: Command): void {
  // Merge local and parent opts — local opts come from command-level flags (--file)
  const parentOpts = command.parent?.opts() ?? {}
  const localOpts = command.opts()
  const opts = { ...parentOpts, ...localOpts }

  try {
    const config = loadConfig()
    const originalId =
      (opts['original'] as string | undefined) ?? config.session.originalBrainId
    const challengerId =
      (opts['challenger'] as string | undefined) ?? config.session.challengerBrainId
    const mirrorEnabled = opts['mirror'] !== false
    const classifyEnabled = opts['classify'] !== false
    const intensity =
      (opts['intensity'] as string | undefined) ?? config.session.defaultIntensity
    const judgeEnabled = opts['judge'] !== false && config.session.judgeEnabled
    const persona = (opts['persona'] as string | undefined) ?? config.session.defaultPersona
    const filePath = opts['file'] as string | undefined

    const brainConfig = config.brains.find(b => b.id === originalId)
    if (!brainConfig) {
      throw new Error(`Original brain not found: ${originalId}`)
    }

    const originalAdapter = createAdapter(brainConfig)
    const challengerConfig = config.brains.find(b => b.id === challengerId)
    const challengerAdapter =
      mirrorEnabled && challengerConfig ? createAdapter(challengerConfig) : undefined

    // Build judge adapter when mirroring is enabled and judge is requested
    let judgeAdapter = undefined
    if (mirrorEnabled && challengerAdapter && judgeEnabled) {
      const judgeId = (opts['judgeBrain'] as string | undefined) ?? config.session.judgeBrainId
      const judgeConfig = config.brains.find(b => b.id === judgeId)
      if (judgeConfig) {
        judgeAdapter = createAdapter(judgeConfig)
      }
    }

    const session = new Session(config.session.historyWindowSize)

    // Inject file content as the first exchange if --file is provided
    if (filePath) {
      try {
        const content = readFileSync(filePath, 'utf8')
        const name = basename(filePath)
        session.addUser(`[FILE: ${name}]\n${content}`)
        session.addAssistant(`I have read the file "${name}". Ask me anything about it.`)
      } catch (err) {
        throw new Error(`Could not read file: ${filePath} — ${(err as Error).message}`)
      }
    }

    const classifier = buildIntentClassifier(config, Boolean(opts['debug']))
    const engine = new MirrorEngine({
      original: originalAdapter,
      challenger: challengerAdapter,
      intensity: intensity as 'mild' | 'moderate' | 'aggressive',
      autoClassify:
        mirrorEnabled && classifyEnabled && config.session.autoClassify,
      classifier,
      debug: Boolean(opts['debug']),
      judge: judgeAdapter,
      persona,
    })

    const app = render(
      React.createElement(MirrorApp, {
        engine,
        session,
        originalId: originalAdapter.id,
        challengerId: challengerAdapter?.id,
        judgerId: judgeAdapter?.id,
        intensity,
        layout: config.ui.layout,
        showTokenCounts: config.ui.showTokenCounts,
        showLatency: config.ui.showLatency,
        syntaxHighlighting: config.ui.syntaxHighlighting,
      })
    )
    void app.waitUntilExit()
  } catch (error) {
    process.stderr.write(`Failed to start chat: ${(error as Error).message}\n`)
    process.exit(1)
  }
}
