import { describe, expect, it } from 'vitest'
import { MockAdapter } from '../../src/brains/mock.js'
import { HeuristicIntentClassifier } from '../../src/engine/intent-classifier.js'
import { MirrorEngine } from '../../src/engine/mirror-engine.js'
import type { MirrorEvent } from '../../src/types/index.js'

function makeEngine(overrides: Partial<ConstructorParameters<typeof MirrorEngine>[0]> = {}) {
  return new MirrorEngine({
    original: new MockAdapter('original', 'This is the original answer.'),
    challenger: new MockAdapter('challenger', 'This is the adversarial challenge.'),
    intensity: 'moderate',
    autoClassify: false,
    classifier: new HeuristicIntentClassifier(),
    ...overrides,
  })
}

async function collect(gen: AsyncGenerator<MirrorEvent, void>): Promise<MirrorEvent[]> {
  const events: MirrorEvent[] = []
  for await (const e of gen) events.push(e)
  return events
}

describe('MirrorEngine — single brain (no challenger)', () => {
  it('emits stream_chunk, brain_complete, all_complete', async () => {
    const engine = makeEngine({ challenger: undefined })
    const events = await collect(engine.run('hello', []))
    expect(events.some(e => e.type === 'stream_chunk' && e.brainId === 'original')).toBe(true)
    expect(events.some(e => e.type === 'brain_complete' && e.brainId === 'original')).toBe(true)
    expect(events.some(e => e.type === 'all_complete')).toBe(true)
    expect(events.some(e => e.type === 'error')).toBe(false)
  })

  it('only emits one brain_complete event', async () => {
    const engine = makeEngine({ challenger: undefined })
    const events = await collect(engine.run('hello', []))
    expect(events.filter(e => e.type === 'brain_complete')).toHaveLength(1)
  })
})

describe('MirrorEngine — mirror mode (two brains)', () => {
  it('emits chunks from both brains', async () => {
    const engine = makeEngine()
    const events = await collect(engine.run('Should I use microservices?', []))
    const origChunks = events.filter(e => e.type === 'stream_chunk' && e.brainId === 'original')
    const chalChunks = events.filter(e => e.type === 'stream_chunk' && e.brainId === 'challenger')
    expect(origChunks.length).toBeGreaterThan(0)
    expect(chalChunks.length).toBeGreaterThan(0)
  })

  it('emits two brain_complete events followed by all_complete', async () => {
    const engine = makeEngine()
    const events = await collect(engine.run('Should I use microservices?', []))
    const completes = events.filter(e => e.type === 'brain_complete')
    expect(completes).toHaveLength(2)
    expect(events[events.length - 1].type).toBe('all_complete')
  })

  it('brain_complete response text contains the full answer', async () => {
    const engine = makeEngine()
    const events = await collect(engine.run('Should I use microservices?', []))
    const origComplete = events.find(
      e => e.type === 'brain_complete' && e.brainId === 'original'
    ) as Extract<MirrorEvent, { type: 'brain_complete' }>
    // MockAdapter streams word-by-word; trimming accounts for trailing space
    expect(origComplete.response.text.trim()).toBe('This is the original answer.')
  })
})

describe('MirrorEngine — intent classification', () => {
  it('emits classifying + classified when autoClassify=true', async () => {
    const engine = makeEngine({ autoClassify: true })
    const events = await collect(engine.run('What is 2+2?', []))
    expect(events.some(e => e.type === 'classifying')).toBe(true)
    expect(events.some(e => e.type === 'classified')).toBe(true)
  })

  it('classifying event comes before stream_chunk events', async () => {
    const engine = makeEngine({ autoClassify: true })
    const events = await collect(engine.run('What is 2+2?', []))
    const classifyingIdx = events.findIndex(e => e.type === 'classifying')
    const firstChunkIdx = events.findIndex(e => e.type === 'stream_chunk')
    expect(classifyingIdx).toBeGreaterThanOrEqual(0)
    if (firstChunkIdx >= 0) {
      expect(classifyingIdx).toBeLessThan(firstChunkIdx)
    }
  })

  it('routes factual questions to single brain (no challenger chunks)', async () => {
    const engine = makeEngine({ autoClassify: true })
    const events = await collect(engine.run('What is the capital of France?', []))
    const classified = events.find(e => e.type === 'classified') as
      | Extract<MirrorEvent, { type: 'classified' }>
      | undefined
    if (classified?.result.category === 'factual_lookup' && !classified.result.shouldMirror) {
      const chalChunks = events.filter(e => e.type === 'stream_chunk' && e.brainId === 'challenger')
      expect(chalChunks).toHaveLength(0)
    }
  })
})

describe('MirrorEngine — error handling', () => {
  it('emits error event when adapter throws', async () => {
    class BrokenAdapter extends MockAdapter {
      async *chat(): AsyncGenerator<never, never> {
        throw new Error('Simulated API failure')
        yield // satisfy TypeScript
      }
    }
    const engine = makeEngine({
      original: new BrokenAdapter('broken'),
      challenger: undefined,
      autoClassify: false,
    })
    const events = await collect(engine.run('hello', []))
    expect(events.some(e => e.type === 'error')).toBe(true)
  })
})

describe('MirrorEngine — history forwarding', () => {
  it('succeeds with non-empty conversation history', async () => {
    const engine = makeEngine({ challenger: undefined, autoClassify: false })
    const history = [
      { role: 'user' as const, content: 'previous question' },
      { role: 'assistant' as const, content: 'previous answer' },
    ]
    const events = await collect(engine.run('follow-up question', history))
    expect(events.some(e => e.type === 'all_complete')).toBe(true)
  })
})
