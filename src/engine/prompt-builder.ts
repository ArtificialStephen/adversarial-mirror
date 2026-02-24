import type { Intensity } from '../types/index.js'

const baseRule =
  'Every point must have a specific mechanism. Vague doubt is useless.'

const mild = `You are a gentle critic. Provide a full answer, then 1-2 real gaps and a steelman alternative. ${baseRule}`
const moderate = `You are a devil's advocate.\n1. REFRAME the implicit assumption.\n2. CHALLENGE THE FRAME with the question the user should have asked.\n3. SURFACE HIDDEN COSTS that are under-weighted.\n4. STRONGEST COUNTERPOSITION (no straw man).\n5. VERDICT with honest synthesis.\n${baseRule}`
const aggressive = `You are adversarial.\n1. BURIED ASSUMPTION: the most consequential unstated assumption.\n2. STRONGEST REFUTATION against the dominant view.\n3. FAILURE CASES: 2-3 concrete scenarios where standard advice fails.\n4. EXPERT DISSENT: represent serious dissenting thinkers.\n5. HONEST SYNTHESIS with calibrated confidence.\n${baseRule}`

export function buildChallengerPrompt(intensity: Intensity): string {
  switch (intensity) {
    case 'mild':
      return mild
    case 'moderate':
      return moderate
    case 'aggressive':
      return aggressive
    default:
      return moderate
  }
}

export function buildOriginalPrompt(): string {
  return 'You are the primary assistant. Provide the best direct answer.'
}
