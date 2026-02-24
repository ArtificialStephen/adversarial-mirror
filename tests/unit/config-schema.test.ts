import { describe, expect, it } from 'vitest'
import { configSchema } from '../../src/config/schema.js'
import { defaultConfig } from '../../src/config/defaults.js'

describe('configSchema', () => {
  it('validates the default config without errors', () => {
    expect(() => configSchema.parse(defaultConfig)).not.toThrow()
  })

  it('rejects an invalid intensity level', () => {
    const bad = {
      ...defaultConfig,
      session: { ...defaultConfig.session, defaultIntensity: 'nuclear' },
    }
    expect(() => configSchema.parse(bad)).toThrow()
  })

  it('rejects an empty brains array', () => {
    expect(() => configSchema.parse({ ...defaultConfig, brains: [] })).toThrow()
  })

  it('rejects an invalid UI layout', () => {
    const bad = { ...defaultConfig, ui: { ...defaultConfig.ui, layout: 'floating' } }
    expect(() => configSchema.parse(bad)).toThrow()
  })

  it('rejects confidence threshold > 1', () => {
    const bad = {
      ...defaultConfig,
      classifier: { ...defaultConfig.classifier, confidenceThreshold: 1.5 },
    }
    expect(() => configSchema.parse(bad)).toThrow()
  })

  it('rejects confidence threshold < 0', () => {
    const bad = {
      ...defaultConfig,
      classifier: { ...defaultConfig.classifier, confidenceThreshold: -0.1 },
    }
    expect(() => configSchema.parse(bad)).toThrow()
  })

  it('rejects negative historyWindowSize', () => {
    const bad = {
      ...defaultConfig,
      session: { ...defaultConfig.session, historyWindowSize: -1 },
    }
    expect(() => configSchema.parse(bad)).toThrow()
  })

  it('accepts all three intensity levels', () => {
    for (const intensity of ['mild', 'moderate', 'aggressive'] as const) {
      const cfg = {
        ...defaultConfig,
        session: { ...defaultConfig.session, defaultIntensity: intensity },
      }
      expect(() => configSchema.parse(cfg)).not.toThrow()
    }
  })

  it('accepts both layout values', () => {
    for (const layout of ['side-by-side', 'stacked'] as const) {
      const cfg = { ...defaultConfig, ui: { ...defaultConfig.ui, layout } }
      expect(() => configSchema.parse(cfg)).not.toThrow()
    }
  })

  it('rejects a brain config with empty id', () => {
    const bad = {
      ...defaultConfig,
      brains: [{ ...defaultConfig.brains[0], id: '' }],
    }
    expect(() => configSchema.parse(bad)).toThrow()
  })

  it('rejects an unsupported provider', () => {
    const bad = {
      ...defaultConfig,
      brains: [{ ...defaultConfig.brains[0], provider: 'groq' }],
    }
    expect(() => configSchema.parse(bad)).toThrow()
  })
})
