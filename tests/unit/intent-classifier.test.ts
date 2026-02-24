import { describe, expect, it } from 'vitest'
import {
  HeuristicIntentClassifier,
  BrainIntentClassifier,
} from '../../src/engine/intent-classifier.js'
import { MockAdapter } from '../../src/brains/mock.js'

describe('HeuristicIntentClassifier', () => {
  const clf = new HeuristicIntentClassifier()

  it.each([
    ['What is the capital of France?'],
    ['Who invented the internet?'],
    ['When did WW2 end?'],
    ['Where is the Eiffel Tower?'],
  ])('classifies "%s" as factual (shouldMirror=false)', async (input) => {
    const result = await clf.classify(input)
    expect(result.shouldMirror).toBe(false)
    expect(result.category).toBe('factual_lookup')
  })

  it.each([
    ['Should I use microservices or a monolith?'],
    ['Is React better than Vue?'],
    ['How should I approach a difficult coworker?'],
    ['Will AI replace software engineers?'],
  ])('classifies open-ended "%s" as analysis (shouldMirror=true)', async (input) => {
    const result = await clf.classify(input)
    expect(result.shouldMirror).toBe(true)
  })

  it('returns confidence between 0 and 1', async () => {
    const result = await clf.classify('Should I invest in crypto?')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('always returns a reason string', async () => {
    const result = await clf.classify('hello')
    expect(typeof result.reason).toBe('string')
    expect(result.reason.length).toBeGreaterThan(0)
  })
})

describe('BrainIntentClassifier with mock adapter', () => {
  it('returns shouldMirror=true when confidence is below threshold', async () => {
    // Mock returns JSON with low confidence
    const mock = new MockAdapter('test', '{"category":"factual_lookup","shouldMirror":false,"confidence":0.3,"reason":"low confidence"}')
    const clf = new BrainIntentClassifier(mock, 0.75)
    const result = await clf.classify('What is 2+2?')
    // Below threshold → forced to mirror
    expect(result.shouldMirror).toBe(true)
    expect(result.reason).toContain('below confidence threshold')
  })

  it('returns shouldMirror=false for factual with high confidence', async () => {
    const mock = new MockAdapter('test', '{"category":"factual_lookup","shouldMirror":false,"confidence":0.95,"reason":"clear factual"}')
    const clf = new BrainIntentClassifier(mock, 0.75)
    const result = await clf.classify('What is the capital of France?')
    expect(result.shouldMirror).toBe(false)
    expect(result.category).toBe('factual_lookup')
  })

  it('returns shouldMirror=true for analysis with high confidence', async () => {
    const mock = new MockAdapter('test', '{"category":"analysis","shouldMirror":true,"confidence":0.9,"reason":"opinion"}')
    const clf = new BrainIntentClassifier(mock, 0.75)
    const result = await clf.classify('Should I use microservices?')
    expect(result.shouldMirror).toBe(true)
    expect(result.category).toBe('analysis')
  })
})
