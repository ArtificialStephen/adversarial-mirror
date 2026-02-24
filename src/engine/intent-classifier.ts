import type { IntentCategory, IntentResult } from '../types/index.js'

export interface IntentClassifier {
  classify(input: string): Promise<IntentResult>
}

export class HeuristicIntentClassifier implements IntentClassifier {
  async classify(input: string): Promise<IntentResult> {
    const trimmed = input.trim().toLowerCase()
    const looksFactual =
      trimmed.startsWith('who ') ||
      trimmed.startsWith('what ') ||
      trimmed.startsWith('when ') ||
      trimmed.startsWith('where ')

    const category: IntentCategory = looksFactual ? 'factual_lookup' : 'analysis'
    const shouldMirror = !looksFactual

    return {
      category,
      shouldMirror,
      confidence: looksFactual ? 0.55 : 0.45,
      reason: looksFactual
        ? 'Heuristic: question starts with who/what/when/where.'
        : 'Heuristic: default to analysis for open-ended prompts.'
    }
  }
}
