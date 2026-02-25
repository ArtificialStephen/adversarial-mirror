import { z } from 'zod'

const brainConfigSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(['anthropic', 'openai', 'gemini', 'mock']),
  model: z.string().min(1),
  apiKeyEnvVar: z.string().min(1)
})

export const configSchema = z.object({
  version: z.number().int().positive(),
  session: z.object({
    originalBrainId: z.string().min(1),
    challengerBrainId: z.string().min(1),
    defaultIntensity: z.enum(['mild', 'moderate', 'aggressive']),
    historyWindowSize: z.number().int().positive(),
    autoClassify: z.boolean(),
    judgeEnabled: z.boolean().default(true),
    judgeBrainId: z.string().min(1).default('claude-sonnet-4-6'),
    defaultPersona: z.string().optional()
  }),
  ui: z.object({
    layout: z.enum(['side-by-side', 'stacked']),
    showTokenCounts: z.boolean(),
    showLatency: z.boolean(),
    syntaxHighlighting: z.boolean()
  }),
  brains: z.array(brainConfigSchema).min(1),
  classifier: z.object({
    brainId: z.string().min(1),
    model: z.string().min(1),
    confidenceThreshold: z.number().min(0).max(1)
  })
})

export type AppConfig = z.infer<typeof configSchema>
export type BrainConfig = z.infer<typeof brainConfigSchema>
