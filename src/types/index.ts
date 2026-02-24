export type ConversationRole = 'system' | 'user' | 'assistant'

export interface ConversationMessage {
  role: ConversationRole
  content: string
}

export type BrainProvider = 'anthropic' | 'openai' | 'gemini' | 'mock'

export interface BrainCapabilities {
  streaming: boolean
  maxContextTokens?: number
}

export interface PingResult {
  ok: boolean
  latencyMs?: number
  error?: string
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface CompletedResponse {
  text: string
  inputTokens?: number
  outputTokens?: number
}

export interface StreamChunk {
  delta: string
  isFinal: boolean
  inputTokens?: number
  outputTokens?: number
}

export type IntentCategory =
  | 'factual_lookup'
  | 'math_computation'
  | 'code_task'
  | 'conversational'
  | 'opinion_advice'
  | 'analysis'
  | 'interpretation'
  | 'prediction'

export interface IntentResult {
  category: IntentCategory
  shouldMirror: boolean
  confidence: number
  reason: string
}

export interface BrainResult {
  brainId: string
  text: string
  inputTokens?: number
  outputTokens?: number
  latencyMs?: number
}

export interface HistoryEntry {
  id: string
  createdAt: string
  question: string
  original: BrainResult
  challenger?: BrainResult
  intent?: IntentResult
}

export type Intensity = 'mild' | 'moderate' | 'aggressive'

export type MirrorEvent =
  | { type: 'classifying' }
  | { type: 'classified'; result: IntentResult }
  | { type: 'stream_chunk'; brainId: string; chunk: StreamChunk }
  | { type: 'brain_complete'; brainId: string; response: CompletedResponse }
  | { type: 'all_complete' }
  | { type: 'error'; error: Error }
