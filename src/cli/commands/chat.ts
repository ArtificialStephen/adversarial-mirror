import React from 'react'
import type { Command } from 'commander'
import { render } from 'ink'
import { createAdapter } from '../../brains/factory.js'
import { loadConfig } from '../../config/loader.js'
import { HeuristicIntentClassifier } from '../../engine/intent-classifier.js'
import { MirrorEngine } from '../../engine/mirror-engine.js'
import { Session } from '../../engine/session.js'
import { MirrorApp } from '../../ui/mirror-app.js'

export function runChat(command: Command): void {
  const opts = command.parent?.opts() ?? {}
  try {
    const config = loadConfig()
    const originalId =
      (opts.original as string | undefined) ?? config.session.originalBrainId
    const challengerId =
      (opts.challenger as string | undefined) ?? config.session.challengerBrainId
    const mirrorEnabled = opts.mirror !== false
    const classifyEnabled = opts.classify !== false
    const intensity =
      (opts.intensity as string | undefined) ?? config.session.defaultIntensity

    const brainConfig = config.brains.find((brain) => brain.id === originalId)

    if (!brainConfig) {
      throw new Error(
        `Original brain not found: ${originalId}`
      )
    }

    const originalAdapter = createAdapter(brainConfig)
    const challengerConfig = config.brains.find(
      (brain) => brain.id === challengerId
    )
    const challengerAdapter = challengerConfig
      ? mirrorEnabled
        ? createAdapter(challengerConfig)
        : undefined
      : undefined
    const session = new Session(config.session.historyWindowSize)
    const classifier = new HeuristicIntentClassifier()
    const engine = new MirrorEngine({
      original: originalAdapter,
      challenger: challengerAdapter,
      intensity: intensity as 'mild' | 'moderate' | 'aggressive',
      autoClassify: mirrorEnabled && classifyEnabled && config.session.autoClassify,
      classifier,
      debug: Boolean(opts.debug)
    })

    render(
      React.createElement(MirrorApp, {
        engine,
        session,
        originalId: originalAdapter.id,
        challengerId: challengerAdapter?.id,
        intensity,
        layout: config.ui.layout,
        showTokenCounts: config.ui.showTokenCounts,
        showLatency: config.ui.showLatency,
        syntaxHighlighting: config.ui.syntaxHighlighting
      })
    )
  } catch (error) {
    process.stderr.write(
      `Failed to start chat: ${(error as Error).message}\n`
    )
    process.exit(1)
  }
}
