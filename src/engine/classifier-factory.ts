import type { AppConfig } from '../config/schema.js'
import { createAdapter } from '../brains/factory.js'
import type { IntentClassifier } from './intent-classifier.js'
import { BrainIntentClassifier, HeuristicIntentClassifier } from './intent-classifier.js'

export function buildIntentClassifier(
  config: AppConfig,
  debug = false
): IntentClassifier {
  const classifierConfig = config.classifier
  const brainConfig = config.brains.find(
    (brain) => brain.id === classifierConfig.brainId
  )

  if (!brainConfig) {
    if (debug) {
      process.stderr.write(
        `[debug] Classifier brain not found: ${classifierConfig.brainId}. Using heuristic.\n`
      )
    }
    return new HeuristicIntentClassifier()
  }

  try {
    const adapter = createAdapter(brainConfig, { model: classifierConfig.model })
    return new BrainIntentClassifier(
      adapter,
      classifierConfig.confidenceThreshold
    )
  } catch (error) {
    if (debug) {
      process.stderr.write(
        `[debug] Failed to init classifier: ${(error as Error).message}. Using heuristic.\n`
      )
    }
    return new HeuristicIntentClassifier()
  }
}
