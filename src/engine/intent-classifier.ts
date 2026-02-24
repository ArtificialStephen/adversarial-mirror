import type {
  ChatOptions,
  IntentCategory,
  IntentResult
} from '../types/index.js'
import type { BrainAdapter } from '../brains/adapter.js'

export interface IntentClassifier {
  classify(input: string): Promise<IntentResult>
}

const intentSystemPrompt = `You are an intent classifier for a CLI assistant. 
Return strict JSON with keys: category, shouldMirror, confidence, reason.
Categories: factual_lookup, math_computation, code_task, conversational, opinion_advice, analysis, interpretation, prediction.
Rules:
- factual_lookup, math_computation, code_task, conversational => shouldMirror false
- opinion_advice, analysis, interpretation, prediction => shouldMirror true
Confidence is 0-1.
Return ONLY JSON.`

export class HeuristicIntentClassifier implements IntentClassifier {
  async classify(input: string): Promise<IntentResult> {
    const trimmed = input.trim().toLowerCase()
    const looksFactual =
      trimmed.startsWith('who ') ||
      trimmed.startsWith('what ') ||
      trimmed.startsWith('when ') ||
      trimmed.startsWith('where ')

    const category: IntentCategory = looksFactual ? 'factual_lookup' : 'analysis'
    const shouldMirror = !looksFactual

    return {
      category,
      shouldMirror,
      confidence: looksFactual ? 0.55 : 0.45,
      reason: looksFactual
        ? 'Heuristic: question starts with who/what/when/where.'
        : 'Heuristic: default to analysis for open-ended prompts.'
    }
  }
}

export class BrainIntentClassifier implements IntentClassifier {
  private readonly adapter: BrainAdapter
  private readonly threshold: number

  constructor(adapter: BrainAdapter, threshold = 0.75) {
    this.adapter = adapter
    this.threshold = threshold
  }

  async classify(input: string): Promise<IntentResult> {
    const messages = [{ role: 'user', content: input }] as const
    const options: ChatOptions = { temperature: 0 }
    const stream = this.adapter.chat(messages, intentSystemPrompt, options)
    let text = ''

    for await (const chunk of stream) {
      if (chunk.delta) {
        text += chunk.delta
      }
    }

    const parsed = safeParseIntent(text)
    const category = parsed.category
    const shouldMirror = parsed.shouldMirror
    const confidence = parsed.confidence

    if (confidence < this.threshold) {
      return {
        ...parsed,
        shouldMirror: true,
        reason: `${parsed.reason} (below confidence threshold ${this.threshold}).`
      }
    }

    return {
      category,
      shouldMirror,
      confidence,
      reason: parsed.reason
    }
  }
}

function safeParseIntent(text: string): IntentResult {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Classifier returned non-JSON output.')
  }
  const json = trimmed.slice(start, end + 1)
  const parsed = JSON.parse(json) as Partial<IntentResult>

  const category = normalizeCategory(parsed.category)
  const confidence = clamp(
    typeof parsed.confidence === 'number' ? parsed.confidence : 0
  )
  const shouldMirror =
    typeof parsed.shouldMirror === 'boolean'
      ? parsed.shouldMirror
      : ['opinion_advice', 'analysis', 'interpretation', 'prediction'].includes(
          category
        )
  const reason =
    typeof parsed.reason === 'string' && parsed.reason
      ? parsed.reason
      : 'No reason provided.'

  return { category, shouldMirror, confidence, reason }
}

function normalizeCategory(value: unknown): IntentCategory {
  const allowed: IntentCategory[] = [
    'factual_lookup',
    'math_computation',
    'code_task',
    'conversational',
    'opinion_advice',
    'analysis',
    'interpretation',
    'prediction'
  ]
  if (typeof value === 'string' && allowed.includes(value as IntentCategory)) {
    return value as IntentCategory
  }
  return 'analysis'
}

function clamp(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
