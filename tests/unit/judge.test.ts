import { describe, expect, it } from 'vitest'
import {
  buildJudgeSystemPrompt,
  buildJudgeMessages,
  extractAgreementScore,
} from '../../src/engine/judge.js'

describe('buildJudgeSystemPrompt', () => {
  it('contains SYNTHESIS section marker', () => {
    expect(buildJudgeSystemPrompt()).toContain('SYNTHESIS')
  })

  it('contains BLIND SPOT section marker', () => {
    expect(buildJudgeSystemPrompt()).toContain('BLIND SPOT')
  })

  it('contains AGREEMENT section marker', () => {
    expect(buildJudgeSystemPrompt()).toContain('AGREEMENT')
  })

  it('is a non-empty string', () => {
    expect(buildJudgeSystemPrompt().trim().length).toBeGreaterThan(0)
  })
})

describe('buildJudgeMessages', () => {
  const question = 'Should I use microservices?'
  const original = 'Yes, microservices are great for scalability.'
  const challenger = 'No, microservices add accidental complexity.'

  it('returns an array with a single user message', () => {
    const msgs = buildJudgeMessages(question, original, challenger)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
  })

  it('includes the question in the message content', () => {
    const msgs = buildJudgeMessages(question, original, challenger)
    expect(msgs[0].content).toContain(question)
  })

  it('includes original response text', () => {
    const msgs = buildJudgeMessages(question, original, challenger)
    expect(msgs[0].content).toContain(original)
  })

  it('includes challenger response text', () => {
    const msgs = buildJudgeMessages(question, original, challenger)
    expect(msgs[0].content).toContain(challenger)
  })

  it('labels responses so they can be distinguished', () => {
    const msgs = buildJudgeMessages(question, original, challenger)
    const content = msgs[0].content
    // Both "Response A" or "RESPONSE A" (original) and "B" (challenger) must appear
    expect(content.toLowerCase()).toContain('response a')
    expect(content.toLowerCase()).toContain('response b')
  })
})

describe('extractAgreementScore', () => {
  it('parses "AGREEMENT: 73%" → 73', () => {
    expect(extractAgreementScore('AGREEMENT: 73%\nSome explanation')).toBe(73)
  })

  it('parses case-insensitively', () => {
    expect(extractAgreementScore('agreement: 50%')).toBe(50)
  })

  it('parses 0%', () => {
    expect(extractAgreementScore('AGREEMENT: 0%')).toBe(0)
  })

  it('parses 100%', () => {
    expect(extractAgreementScore('AGREEMENT: 100%')).toBe(100)
  })

  it('clamps values to 0-100 range', () => {
    expect(extractAgreementScore('AGREEMENT: 150%')).toBe(100)
    expect(extractAgreementScore('AGREEMENT: -10%')).toBe(0)
  })

  it('returns undefined for text with no AGREEMENT marker', () => {
    expect(extractAgreementScore('No score here.')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(extractAgreementScore('')).toBeUndefined()
  })

  it('handles extra whitespace', () => {
    expect(extractAgreementScore('AGREEMENT:   85%')).toBe(85)
  })
})
