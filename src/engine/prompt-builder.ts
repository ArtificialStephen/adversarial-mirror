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

// ── Persona definitions ────────────────────────────────────────────────────────

export type PersonaName = 'vc-skeptic' | 'security-auditor' | 'end-user' | 'regulator' | 'contrarian'

interface PersonaDef {
  label: string
  lens: string
  focusAreas: string[]
}

const PERSONAS: Record<PersonaName, PersonaDef> = {
  'vc-skeptic': {
    label: 'VC Skeptic',
    lens: 'Investor/VC scrutiny',
    focusAreas: [
      'Market sizing assumptions — are they realistic or aspirational?',
      'Unit economics — does the math work at scale?',
      'Competitive moat — what stops a well-funded competitor from copying this?',
      'Defensibility — what makes this durable beyond 18 months?',
    ],
  },
  'security-auditor': {
    label: 'Security Auditor',
    lens: 'Security and risk analysis',
    focusAreas: [
      'Attack surfaces — what can be exploited externally or internally?',
      'Trust boundaries — where are credentials, data, or permissions crossing lines?',
      'Failure modes — what happens when this breaks under adversarial conditions?',
      'Blast radius — what is the worst-case scope of a breach or failure?',
    ],
  },
  'end-user': {
    label: 'End User',
    lens: 'Real user perspective',
    focusAreas: [
      'Real needs vs stated needs — what does the user actually want vs what they said?',
      'Adoption friction — what will cause users to abandon this in the first week?',
      'Actual behavior — what do users do vs what you think they will do?',
      'Comprehension gaps — what will users misunderstand or misuse?',
    ],
  },
  'regulator': {
    label: 'Regulator',
    lens: 'Compliance and legal exposure',
    focusAreas: [
      'Regulatory exposure — what laws, rules, or frameworks apply and are being ignored?',
      'Liability — who bears legal responsibility when this causes harm?',
      'Stakeholder harm — who could be injured, defrauded, or discriminated against?',
      'Unintended consequences — what second-order effects could trigger enforcement action?',
    ],
  },
  'contrarian': {
    label: 'Contrarian',
    lens: 'Pure intellectual opposition',
    focusAreas: [
      'Historical failures — name similar ideas that failed and why this is the same.',
      'Second-order effects — what happens after the first-order success plays out?',
      'Inverted premise — what if the opposite assumption is actually correct?',
      'Consensus trap — why might the conventional wisdom here be exactly wrong?',
    ],
  },
}

export function buildPersonaChallengerPrompt(persona: PersonaName, intensity: Intensity): string {
  const def = PERSONAS[persona]
  if (!def) return buildChallengerPrompt(intensity)

  const focusList = def.focusAreas.map((area, i) => `${i + 1}. ${area}`).join('\n')
  const basePrompt = buildChallengerPrompt(intensity)

  return `You are applying the lens of a ${def.label} (${def.lens}).

Your specific focus areas for this lens:
${focusList}

Apply this lens rigorously throughout your response. Every critique must flow from this professional perspective.

---

${basePrompt}`
}

export function isValidPersona(name: string): name is PersonaName {
  return name in PERSONAS
}
