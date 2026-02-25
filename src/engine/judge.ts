import type { ConversationMessage } from '../types/index.js'

export function buildJudgeSystemPrompt(): string {
  return `You are a neutral synthesis judge evaluating two AI responses to the same question.

Your output MUST follow this exact structure:

AGREEMENT: <number>%
<One sentence explaining what drives the score — where they converge or diverge>

SYNTHESIS
<The actual synthesized recommendation — the verdict after weighing both responses. Be concrete and actionable.>

BLIND SPOT
<What both models missed or assumed without questioning. Be specific — name the assumption or gap.>

Scoring guide for AGREEMENT:
- 90–100%: Substantively identical conclusions, only stylistic differences
- 70–89%: Same core answer, meaningful differences in emphasis or caveats
- 50–69%: Partial overlap, notable disagreement on key points
- 30–49%: Different conclusions but some shared premises
- 0–29%: Fundamentally opposed positions

Be direct and critical. Do not praise either response.`
}

export function buildJudgeMessages(
  question: string,
  originalText: string,
  challengerText: string
): ConversationMessage[] {
  return [
    {
      role: 'user',
      content: `QUESTION
${question}

---

RESPONSE A (Original)
${originalText}

---

RESPONSE B (Challenger)
${challengerText}

---

Provide your synthesis following the required format exactly.`,
    },
  ]
}

export function extractAgreementScore(text: string): number | undefined {
  const match = /AGREEMENT:\s*(-?\d+)%/i.exec(text)
  if (!match) return undefined
  const n = parseInt(match[1], 10)
  if (isNaN(n)) return undefined
  return Math.max(0, Math.min(100, n))
}
