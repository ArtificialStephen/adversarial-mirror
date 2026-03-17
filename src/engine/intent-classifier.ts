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

    // Greetings, closings, small talk — no challenger needed
    const looksConversational =
      /^(hi|hello|hey|sup|yo|howdy|good morning|good afternoon|good evening|good night)\b/.test(trimmed) ||
      /^(thanks|thank you|cheers|bye|goodbye|see you|take care)\b/.test(trimmed) ||
      /^(how are you|what's up|how's it going|nice to meet you)\b/.test(trimmed) ||
      (trimmed.split(/\s+/).length <= 2 && /^(hi|hello|hey|thanks|bye|ok|okay|sure|yes|no|yep|nope)$/.test(trimmed))

    if (looksConversational) {
      return {
        category: 'conversational',
        shouldMirror: false,
        confidence: 0.85,
        reason: 'Heuristic: conversational greeting or small talk.'
      }
    }

    // Objective patterns — single correct answer or concrete task
    const looksFactual =
      /^(who|what|when|where|how many|how much|how long|how far|how old)\b/.test(trimmed) ||
      /^(define|calculate|convert|list|enumerate|name|tell me)\b/.test(trimmed) ||
      /^(write|create|build|implement|fix|debug|refactor|add|remove|update)\b/.test(trimmed) ||
      /^(show me|give me|find|get|fetch|run|execute)\b/.test(trimmed)

    // Opinion/debate patterns — benefits from a challenger
    const looksOpinionated =
      /\b(should|would|could|best|better|worse|recommend|prefer|think|feel|believe|opinion|advice)\b/.test(trimmed) ||
      /\b(pros|cons|tradeoffs?|vs\.?|versus|compare|difference between)\b/.test(trimmed) ||
      /\b(why|is it worth|is it good|is it bad|what do you think)\b/.test(trimmed)

    let category: IntentCategory
    let shouldMirror: boolean

    if (looksFactual && !looksOpinionated) {
      category = /^(write|create|build|implement|fix|debug|refactor)/.test(trimmed)
        ? 'code_task'
        : 'factual_lookup'
      shouldMirror = false
    } else if (looksOpinionated) {
      category = 'opinion_advice'
      shouldMirror = true
    } else {
      category = 'analysis'
      shouldMirror = true
    }

    return {
      category,
      shouldMirror,
      confidence: 0.6,
      reason: `Heuristic: ${shouldMirror ? 'open-ended or opinion-based prompt.' : 'objective/task-oriented prompt.'}`
    }
  }
}

export class BrainIntentClassifier implements IntentClassifier {
  private readonly adapter: BrainAdapter
  private readonly fallback = new HeuristicIntentClassifier()

  constructor(adapter: BrainAdapter) {
    this.adapter = adapter
  }

  async classify(input: string): Promise<IntentResult> {
    try {
      const messages = [{ role: 'user' as const, content: input }]
      const options: ChatOptions = { temperature: 0 }
      const stream = this.adapter.chat(messages, intentSystemPrompt, options)
      let text = ''

      for await (const chunk of stream) {
        if (chunk.delta) text += chunk.delta
      }

      return safeParseIntent(text)
    } catch {
      // Adapter threw (API error, network, etc.) or model returned non-JSON — fall back to heuristic
      return this.fallback.classify(input)
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
      : ['opinion_advice', 'analysis', 'interpretation', 'prediction'].includes(category)
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
