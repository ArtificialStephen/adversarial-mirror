import React from 'react'
import { render } from 'ink'
import { createAdapter } from '../../brains/factory.js'
import { loadConfig } from '../../config/loader.js'
import { HeuristicIntentClassifier } from '../../engine/intent-classifier.js'
import { MirrorEngine } from '../../engine/mirror-engine.js'
import { Session } from '../../engine/session.js'
import { MirrorApp } from '../../ui/mirror-app.js'

export function runChat(): void {
  try {
    const config = loadConfig()
    const brainConfig = config.brains.find(
      (brain) => brain.id === config.session.originalBrainId
    )

    if (!brainConfig) {
      throw new Error(
        `Original brain not found: ${config.session.originalBrainId}`
      )
    }

    const originalAdapter = createAdapter(brainConfig)
    const challengerConfig = config.brains.find(
      (brain) => brain.id === config.session.challengerBrainId
    )
    const challengerAdapter = challengerConfig
      ? createAdapter(challengerConfig)
      : undefined
    const session = new Session(config.session.historyWindowSize)
    const classifier = new HeuristicIntentClassifier()
    const engine = new MirrorEngine({
      original: originalAdapter,
      challenger: challengerAdapter,
      intensity: config.session.defaultIntensity,
      autoClassify: config.session.autoClassify,
      classifier
    })

    render(
      React.createElement(MirrorApp, {
        engine,
        session,
        originalId: originalAdapter.id,
        challengerId: challengerAdapter?.id,
        intensity: config.session.defaultIntensity,
        layout: config.ui.layout
      })
    )
  } catch (error) {
    process.stderr.write(
      `Failed to start chat: ${(error as Error).message}\n`
    )
    process.exit(1)
  }
}
