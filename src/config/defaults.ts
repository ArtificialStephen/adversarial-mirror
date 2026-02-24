import type { AppConfig } from './schema.js'

export const defaultConfig: AppConfig = {
  version: 1,
  session: {
    originalBrainId: 'claude-sonnet-4-6',
    challengerBrainId: 'gpt-4o',
    defaultIntensity: 'moderate',
    historyWindowSize: 20,
    autoClassify: true
  },
  ui: {
    layout: 'side-by-side',
    showTokenCounts: false,
    showLatency: true,
    syntaxHighlighting: true
  },
  brains: [
    {
      id: 'claude-sonnet-4-6',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY'
    },
    {
      id: 'gpt-4o',
      provider: 'openai',
      model: 'gpt-4o',
      apiKeyEnvVar: 'OPENAI_API_KEY'
    },
    {
      id: 'gemini-pro',
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      apiKeyEnvVar: 'GOOGLE_API_KEY'
    }
  ],
  classifier: {
    brainId: 'claude-sonnet-4-6',
    model: 'claude-haiku-4-5-20251001',
    confidenceThreshold: 0.75
  }
}
