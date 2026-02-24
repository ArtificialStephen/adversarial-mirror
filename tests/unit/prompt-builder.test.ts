import { describe, expect, it } from 'vitest'
import { buildChallengerPrompt, buildOriginalPrompt } from '../../src/engine/prompt-builder.js'

const rule = 'Every point must have a specific mechanism. Vague doubt is useless.'

describe('prompt builder', () => {
  it('builds original prompt', () => {
    const prompt = buildOriginalPrompt()
    expect(prompt.length).toBeGreaterThan(10)
  })

  it('builds mild prompt with base rule', () => {
    const prompt = buildChallengerPrompt('mild')
    expect(prompt).toContain(rule)
  })

  it('builds moderate prompt with base rule', () => {
    const prompt = buildChallengerPrompt('moderate')
    expect(prompt).toContain(rule)
  })

  it('builds aggressive prompt with base rule', () => {
    const prompt = buildChallengerPrompt('aggressive')
    expect(prompt).toContain(rule)
  })
})
