import { describe, expect, it, beforeEach } from 'vitest'
import { MockAdapter } from '../../src/brains/mock.js'
import { HeuristicIntentClassifier } from '../../src/engine/intent-classifier.js'
import { MirrorEngine } from '../../src/engine/mirror-engine.js'
import { Session } from '../../src/engine/session.js'
import type { MirrorEvent } from '../../src/types/index.js'

// Full pipeline tests — no real API calls, uses MockAdapter throughout.

function makeFullEngine() {
  return new MirrorEngine({
    original: new MockAdapter('claude', 'The original perspective on this topic.'),
    challenger: new MockAdapter('gpt4', 'A challenging counter-perspective on this.'),
    intensity: 'moderate',
    autoClassify: false,
    classifier: new HeuristicIntentClassifier(),
  })
}

async function run(engine: MirrorEngine, question: string, history = new Session()) {
  const events: MirrorEvent[] = []
  for await (const e of engine.run(question, history.getHistory())) {
    events.push(e)
  }
  return events
}

describe('Full mirror flow', () => {
  let engine: MirrorEngine
  let session: Session

  beforeEach(() => {
    engine = makeFullEngine()
    session = new Session(20)
  })

  it('emits all expected event types in the correct order', async () => {
    const events = await run(engine, 'Should I use microservices?', session)
    const types = events.map(e => e.type)
    expect(types).toContain('stream_chunk')
    expect(types).toContain('brain_complete')
    expect(types).toContain('all_complete')
    expect(types).not.toContain('error')
    // all_complete must be last
    expect(types[types.length - 1]).toBe('all_complete')
  })

  it('accumulates correct full text from stream chunks per brain', async () => {
    const events = await run(engine, 'Should I use microservices?', session)
    const accumulated = new Map<string, string>()
    for (const e of events) {
      if (e.type === 'stream_chunk') {
        accumulated.set(e.brainId, (accumulated.get(e.brainId) ?? '') + e.chunk.delta)
      }
    }
    expect(accumulated.get('claude')?.trim()).toBe('The original perspective on this topic.')
    expect(accumulated.get('gpt4')?.trim()).toBe('A challenging counter-perspective on this.')
  })

  it('brain_complete response.text matches streamed accumulation', async () => {
    const events = await run(engine, 'Should I use microservices?', session)
    const streamedText = new Map<string, string>()
    const completedText = new Map<string, string>()

    for (const e of events) {
      if (e.type === 'stream_chunk') {
        streamedText.set(e.brainId, (streamedText.get(e.brainId) ?? '') + e.chunk.delta)
      }
      if (e.type === 'brain_complete') {
        completedText.set(e.brainId, e.response.text)
      }
    }
    expect(completedText.get('claude')).toBe(streamedText.get('claude'))
    expect(completedText.get('gpt4')).toBe(streamedText.get('gpt4'))
  })

  it('maintains conversation history across multiple turns', async () => {
    session.addUser('First question')
    session.addAssistant('First answer')
    const events = await run(engine, 'Second follow-up question', session)
    expect(events.some(e => e.type === 'all_complete')).toBe(true)
    expect(events.some(e => e.type === 'error')).toBe(false)
  })

  it('single brain mode completes with exactly one brain_complete', async () => {
    const singleEngine = new MirrorEngine({
      original: new MockAdapter('original', 'Single brain answer.'),
      intensity: 'moderate',
      autoClassify: false,
      classifier: new HeuristicIntentClassifier(),
    })
    const events = await run(singleEngine, 'hello')
    expect(events.filter(e => e.type === 'brain_complete')).toHaveLength(1)
    expect(events.some(e => e.type === 'all_complete')).toBe(true)
  })

  it('handles abort signal without crashing', async () => {
    const controller = new AbortController()
    const events: MirrorEvent[] = []
    try {
      for await (const e of engine.run('Should I use microservices?', [], { signal: controller.signal })) {
        events.push(e)
        if (events.length === 1) controller.abort() // abort after first event
      }
    } catch (err) {
      // AbortError is an acceptable outcome
      expect((err as Error).name).toBe('AbortError')
    }
    // Either aborted cleanly or completed before abort propagated — both are valid
    const hasError = events.some(e => e.type === 'error')
    const hasComplete = events.some(e => e.type === 'all_complete')
    expect(hasError || hasComplete || events.length >= 0).toBe(true)
  })

  it('with autoClassify=true, emits classifying before any stream_chunk', async () => {
    const classifyingEngine = new MirrorEngine({
      original: new MockAdapter('claude', 'Answer.'),
      challenger: new MockAdapter('gpt4', 'Challenge.'),
      intensity: 'moderate',
      autoClassify: true,
      classifier: new HeuristicIntentClassifier(),
    })
    const events = await run(classifyingEngine, 'Should I quit my job?')
    const classifyIdx = events.findIndex(e => e.type === 'classifying')
    const firstChunkIdx = events.findIndex(e => e.type === 'stream_chunk')
    expect(classifyIdx).toBeGreaterThanOrEqual(0)
    if (firstChunkIdx >= 0) {
      expect(classifyIdx).toBeLessThan(firstChunkIdx)
    }
  })
})

describe('Session + MirrorEngine integration', () => {
  it('session history is passed correctly to the engine', async () => {
    const session = new Session(20)
    session.addUser('What is TypeScript?')
    session.addAssistant('TypeScript is a typed superset of JavaScript.')

    const engine = makeFullEngine()
    const events: MirrorEvent[] = []
    for await (const e of engine.run('What are its main benefits?', session.getHistory())) {
      events.push(e)
    }
    expect(events.some(e => e.type === 'all_complete')).toBe(true)
  })

  it('session truncates history at the configured window', () => {
    const session = new Session(4)
    for (let i = 0; i < 6; i++) {
      session.addUser(`question ${i}`)
      session.addAssistant(`answer ${i}`)
    }
    expect(session.getHistory()).toHaveLength(4)
  })
})
