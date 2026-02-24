import { describe, expect, it } from 'vitest'
import {
  buildChallengerPrompt,
  buildOriginalPrompt,
} from '../../src/engine/prompt-builder.js'

const MECHANISM_RULE = 'Every point must have a specific mechanism. Vague doubt is useless.'

describe('buildOriginalPrompt', () => {
  it('returns a non-trivial string', () => {
    expect(buildOriginalPrompt().length).toBeGreaterThan(10)
  })

  it('is consistent across calls', () => {
    expect(buildOriginalPrompt()).toBe(buildOriginalPrompt())
  })
})

describe('buildChallengerPrompt', () => {
  it.each(['mild', 'moderate', 'aggressive'] as const)(
    '%s prompt contains the mechanism rule',
    (intensity) => {
      expect(buildChallengerPrompt(intensity)).toContain(MECHANISM_RULE)
    }
  )

  it('mild prompt is distinct from moderate', () => {
    expect(buildChallengerPrompt('mild')).not.toBe(buildChallengerPrompt('moderate'))
  })

  it('moderate prompt is distinct from aggressive', () => {
    expect(buildChallengerPrompt('moderate')).not.toBe(buildChallengerPrompt('aggressive'))
  })

  it('moderate prompt contains devil\'s advocate structure markers', () => {
    const p = buildChallengerPrompt('moderate')
    expect(p).toContain('REFRAME')
    expect(p).toContain('VERDICT')
  })

  it('aggressive prompt contains adversarial structure markers', () => {
    const p = buildChallengerPrompt('aggressive')
    expect(p).toContain('BURIED ASSUMPTION')
    expect(p).toContain('HONEST SYNTHESIS')
  })

  it('unknown intensity falls back to moderate', () => {
    // @ts-expect-error testing fallback
    const fallback = buildChallengerPrompt('unknown')
    expect(fallback).toBe(buildChallengerPrompt('moderate'))
  })
})
