import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { MockAdapter } from '../../src/brains/mock.js'
import { createAdapter } from '../../src/brains/factory.js'
import type { BrainConfig } from '../../src/config/schema.js'

const baseConfig: BrainConfig = {
  id: 'test-brain',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  apiKeyEnvVar: 'ANTHROPIC_API_KEY',
}

// ── MockAdapter ───────────────────────────────────────────────────────────────

describe('MockAdapter', () => {
  it('ping always returns ok=true', async () => {
    const a = new MockAdapter('test', 'Hello world')
    expect((await a.ping()).ok).toBe(true)
  })

  it('streams all words from the response text', async () => {
    const text = 'Hello world from mock'
    const a = new MockAdapter('test', text)
    let accumulated = ''
    for await (const chunk of a.chat([], 'system')) {
      accumulated += chunk.delta
    }
    expect(accumulated.trim()).toBe(text)
  })

  it('last yielded chunk has isFinal=true', async () => {
    const a = new MockAdapter('test', 'Hi there')
    const chunks = []
    for await (const c of a.chat([], 'system')) chunks.push(c)
    expect(chunks[chunks.length - 1].isFinal).toBe(true)
  })

  it('non-final chunks have isFinal=false', async () => {
    const a = new MockAdapter('test', 'one two three')
    const chunks = []
    for await (const c of a.chat([], 'system')) chunks.push(c)
    const nonFinal = chunks.filter(c => !c.isFinal)
    expect(nonFinal.every(c => c.isFinal === false)).toBe(true)
  })

  it('estimateTokens is proportional to content size', () => {
    const a = new MockAdapter('test')
    const long = a.estimateTokens([{ role: 'user', content: 'x'.repeat(200) }])
    const short = a.estimateTokens([{ role: 'user', content: 'x'.repeat(10) }])
    expect(long).toBeGreaterThan(short)
  })

  it('dispose resolves without error', async () => {
    const a = new MockAdapter('test')
    await expect(a.dispose()).resolves.toBeUndefined()
  })

  it('handles empty response text gracefully', async () => {
    const a = new MockAdapter('test', '')
    const chunks = []
    for await (const c of a.chat([], 'system')) chunks.push(c)
    // Should at least emit the final chunk
    expect(chunks.some(c => c.isFinal)).toBe(true)
  })
})

// ── createAdapter with MOCK_BRAINS ────────────────────────────────────────────

describe('createAdapter — MOCK_BRAINS=true', () => {
  beforeEach(() => { process.env['MOCK_BRAINS'] = 'true' })
  afterEach(() => { delete process.env['MOCK_BRAINS'] })

  it('always returns a MockAdapter regardless of provider', () => {
    for (const provider of ['anthropic', 'openai', 'gemini'] as const) {
      const adapter = createAdapter({ ...baseConfig, provider })
      expect(adapter).toBeInstanceOf(MockAdapter)
      expect(adapter.provider).toBe('mock')
    }
  })

  it('returns mock adapter for mock provider too', () => {
    const adapter = createAdapter({ ...baseConfig, provider: 'mock' })
    expect(adapter).toBeInstanceOf(MockAdapter)
  })

  it('created mock adapter has the correct id', () => {
    const adapter = createAdapter({ ...baseConfig, id: 'my-brain' })
    expect(adapter.id).toBe('my-brain')
  })
})

// ── createAdapter without MOCK_BRAINS ─────────────────────────────────────────

describe('createAdapter — real providers (no API key)', () => {
  it('throws when API key env var is missing', () => {
    const key = 'DEFINITELY_NOT_SET_KEY_XYZ'
    delete process.env[key]
    expect(() =>
      createAdapter({ ...baseConfig, apiKeyEnvVar: key })
    ).toThrow(/Missing API key/)
  })
})
