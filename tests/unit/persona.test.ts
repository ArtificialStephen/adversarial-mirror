import { describe, expect, it } from 'vitest'
import {
  buildPersonaChallengerPrompt,
  buildChallengerPrompt,
  isValidPersona,
  type PersonaName,
} from '../../src/engine/prompt-builder.js'
import type { Intensity } from '../../src/types/index.js'

const personas: PersonaName[] = [
  'vc-skeptic',
  'security-auditor',
  'end-user',
  'regulator',
  'contrarian',
]

const intensities: Intensity[] = ['mild', 'moderate', 'aggressive']

describe('isValidPersona', () => {
  it('returns true for all 5 valid persona names', () => {
    for (const p of personas) {
      expect(isValidPersona(p)).toBe(true)
    }
  })

  it('returns false for unknown names', () => {
    expect(isValidPersona('unknown')).toBe(false)
    expect(isValidPersona('')).toBe(false)
    expect(isValidPersona('vc_skeptic')).toBe(false)
  })
})

describe('buildPersonaChallengerPrompt — persona distinctness', () => {
  for (const persona of personas) {
    it(`${persona} produces output distinct from the default challenger`, () => {
      const personaPrompt = buildPersonaChallengerPrompt(persona, 'moderate')
      const defaultPrompt = buildChallengerPrompt('moderate')
      expect(personaPrompt).not.toBe(defaultPrompt)
    })
  }
})

describe('buildPersonaChallengerPrompt — lens focus areas', () => {
  it('vc-skeptic prompt contains market sizing or unit economics language', () => {
    const prompt = buildPersonaChallengerPrompt('vc-skeptic', 'moderate')
    const lower = prompt.toLowerCase()
    expect(lower).toMatch(/market sizing|unit economics|competitive moat|defensib/)
  })

  it('security-auditor prompt contains security-specific language', () => {
    const prompt = buildPersonaChallengerPrompt('security-auditor', 'moderate')
    const lower = prompt.toLowerCase()
    expect(lower).toMatch(/attack surface|trust boundar|failure mode|blast radius/)
  })

  it('end-user prompt contains user adoption language', () => {
    const prompt = buildPersonaChallengerPrompt('end-user', 'moderate')
    const lower = prompt.toLowerCase()
    expect(lower).toMatch(/adoption|real need|actual behavior|friction/)
  })

  it('regulator prompt contains compliance/legal language', () => {
    const prompt = buildPersonaChallengerPrompt('regulator', 'moderate')
    const lower = prompt.toLowerCase()
    expect(lower).toMatch(/regulat|liabilit|stakeholder harm|compliance/)
  })

  it('contrarian prompt contains intellectual opposition language', () => {
    const prompt = buildPersonaChallengerPrompt('contrarian', 'moderate')
    const lower = prompt.toLowerCase()
    expect(lower).toMatch(/historical failure|second.order|opposite|consensus/)
  })
})

describe('buildPersonaChallengerPrompt — all 5×3 combinations', () => {
  for (const persona of personas) {
    for (const intensity of intensities) {
      it(`${persona} × ${intensity} produces a non-empty string`, () => {
        const result = buildPersonaChallengerPrompt(persona, intensity)
        expect(typeof result).toBe('string')
        expect(result.trim().length).toBeGreaterThan(0)
      })
    }
  }
})

describe('buildPersonaChallengerPrompt — intensity structure preserved', () => {
  it('mild persona includes gentle critic style', () => {
    const prompt = buildPersonaChallengerPrompt('contrarian', 'mild')
    expect(prompt.toLowerCase()).toContain('gentle critic')
  })

  it('moderate persona includes devil\'s advocate structure', () => {
    const prompt = buildPersonaChallengerPrompt('vc-skeptic', 'moderate')
    expect(prompt).toContain('REFRAME')
  })

  it('aggressive persona includes adversarial structure', () => {
    const prompt = buildPersonaChallengerPrompt('security-auditor', 'aggressive')
    expect(prompt).toContain('BURIED ASSUMPTION')
  })
})
