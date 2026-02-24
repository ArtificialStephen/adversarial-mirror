# Adversarial Mirror — Implementation Plan

## Context
A CLI middleware agent ("Adversarial Mirror") that sits between the user and AI models.
Every query is forked to two AI "brains" in parallel — an original and a challenger.
The challenger is adversarially prompted to find flaws, missing assumptions, and counter-arguments.
This combats AI sycophancy and echo chambers. The mental model: "connect any brain" to a brain-agnostic middleware layer.

---

## Tech Stack
- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript
- **CLI framework**: Commander.js (commands) + Ink (React-based terminal UI)
- **Bundler**: tsup
- **Testing**: Vitest + MSW (mock API servers)
- **Packaging**: pkg (standalone binaries)

---

## Project Structure

```
adversarial-mirror/
├── .github/workflows/
│   ├── ci.yml            # Test on all 3 OS × Node 20/22
│   ├── release.yml       # npm publish + binary builds on tag
├── src/
│   ├── cli/
│   │   ├── index.ts              # Commander entry point
│   │   ├── commands/
│   │   │   ├── chat.ts           # Interactive session
│   │   │   ├── mirror.ts         # One-shot query
│   │   │   ├── config.ts         # Config subcommands
│   │   │   └── brains.ts         # Brain list/test/add
│   │   └── repl.ts               # REPL loop
│   ├── engine/
│   │   ├── mirror-engine.ts      # Core fork/merge orchestration
│   │   ├── intent-classifier.ts  # Factual vs opinion routing
│   │   ├── prompt-builder.ts     # Adversarial system prompts (3 levels)
│   │   └── session.ts            # Conversation history + truncation
│   ├── brains/
│   │   ├── adapter.ts            # BrainAdapter interface + BrainRegistry
│   │   ├── anthropic.ts          # Claude adapter
│   │   ├── openai.ts             # OpenAI/Codex adapter
│   │   ├── gemini.ts             # Gemini adapter
│   │   └── mock.ts               # For tests
│   ├── config/
│   │   ├── schema.ts             # Zod schema
│   │   ├── loader.ts             # Cross-platform config (conf package)
│   │   └── defaults.ts
│   ├── ui/
│   │   ├── app.tsx               # Root Ink component
│   │   └── components/
│   │       ├── ChatLayout.tsx    # Side-by-side / stacked layout
│   │       ├── BrainPanel.tsx    # Single brain response panel
│   │       ├── StreamingText.tsx # Live streaming text
│   │       ├── StatusBar.tsx     # Token count, latency, history turns
│   │       ├── InputPrompt.tsx
│   │       └── IntentBadge.tsx   # [MIRRORING] / [DIRECT] badge
│   └── types/index.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/mock-responses.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

## CLI Commands

```
mirror chat                    # Interactive session (default)
mirror mirror "question"       # One-shot, exits after response
mirror config init             # Interactive setup wizard
mirror config show             # Display current config (redacts keys)
mirror config set <key> <val>
mirror brains list
mirror brains test <id>
mirror brains add
mirror history list
mirror history show <id>
mirror history export <id>

Global flags:
  --intensity mild|moderate|aggressive
  --original <brain-id>
  --challenger <brain-id>
  --no-mirror
  --no-classify
  --debug
```

---

## Brain Adapter Interface (src/brains/adapter.ts)

```typescript
interface BrainAdapter {
  readonly id: string
  readonly provider: 'anthropic' | 'openai' | 'gemini' | 'mock'
  readonly capabilities: BrainCapabilities

  ping(): Promise<PingResult>
  chat(
    messages: ConversationMessage[],
    systemPrompt: string,
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk, CompletedResponse>
  estimateTokens(messages: ConversationMessage[]): number
  dispose(): Promise<void>
}

interface StreamChunk {
  delta: string
  isFinal: boolean
  inputTokens?: number
  outputTokens?: number
}
```

---

## Mirror Engine Flow

```
User input
  │
  ▼
[Intent Classifier] ─── factual/conversational ──► Direct path (single brain)
  │
  ▼ opinion/analysis/prediction
[Parallel fork]
  ├── Brain A: original system prompt → stream chunks
  └── Brain B: adversarial system prompt → stream chunks
            │
            ▼
[mergeStreams()] → MirrorEvent async generator → UI renders both panels live
```

MirrorEngine emits typed events: `classifying`, `classified`, `stream_chunk`, `brain_complete`, `all_complete`, `error`.
The UI is purely reactive — it consumes events and renders. Engine and UI are fully decoupled.

Challenger receives full history with original brain turns labeled `[PREVIOUS ORIGINAL RESPONSE]`
so it can detect patterns of consistent overconfidence or blind spots across turns.

---

## Config Schema (~/.config/adversarial-mirror/config.json)

```json
{
  "version": 1,
  "session": {
    "originalBrainId": "claude-sonnet-4-6",
    "challengerBrainId": "gpt-4o",
    "defaultIntensity": "moderate",
    "historyWindowSize": 20,
    "autoClassify": true
  },
  "ui": {
    "layout": "side-by-side",
    "showTokenCounts": false,
    "showLatency": true,
    "syntaxHighlighting": true
  },
  "brains": [
    {
      "id": "claude-sonnet-4-6",
      "provider": "anthropic",
      "model": "claude-sonnet-4-6",
      "apiKeyEnvVar": "ANTHROPIC_API_KEY"
    },
    {
      "id": "gpt-4o",
      "provider": "openai",
      "model": "gpt-4o",
      "apiKeyEnvVar": "OPENAI_API_KEY"
    },
    {
      "id": "gemini-pro",
      "provider": "gemini",
      "model": "gemini-1.5-pro",
      "apiKeyEnvVar": "GOOGLE_API_KEY"
    }
  ],
  "classifier": {
    "brainId": "claude-sonnet-4-6",
    "model": "claude-haiku-4-5-20251001",
    "confidenceThreshold": 0.75
  }
}
```

Config stored at:
- Linux/Mac: `~/.config/adversarial-mirror/config.json`
- Windows: `%APPDATA%\adversarial-mirror\config.json`

---

## Adversarial Prompts (src/engine/prompt-builder.ts)

Three intensity levels. The quality of these prompts is the product's core differentiator.

**MILD** — Gentle Critic: Provide your own complete answer, plus 1-2 genuine gaps and a steelman alternative. No reflexive contrarianism.

**MODERATE** — Devil's Advocate:
1. REFRAME: Surface the implicit assumption in how the question is framed.
2. CHALLENGE THE FRAME: Answer the question the user *should* have asked.
3. SURFACE HIDDEN COSTS: Name specific costs that are routinely under-weighted.
4. STRONGEST COUNTERPOSITION: Best reasonable counterargument (not straw man).
5. VERDICT: Honest synthesis after steelmanning opposition.

**AGGRESSIVE** — Adversarial:
1. BURIED ASSUMPTION: Single most consequential unstated assumption.
2. STRONGEST REFUTATION: Best credible argument against the dominant view.
3. FAILURE CASES: 2-3 specific concrete scenarios where standard advice fails.
4. EXPERT DISSENT: Represent serious dissenting thinkers at their strongest.
5. HONEST SYNTHESIS: Genuine conclusion, calibrated confidence.

Rule enforced in all prompts: "Every point must have a specific mechanism. Vague doubt is useless."

---

## Intent Classifier Prompt (src/engine/intent-classifier.ts)

Routes: `factual_lookup`, `math_computation`, `code_task`, `conversational` → shouldMirror: false
Routes: `opinion_advice`, `analysis`, `interpretation`, `prediction` → shouldMirror: true

Returns strict JSON: `{ category, shouldMirror, confidence, reason }`

Bias toward mirroring: confidence threshold 0.75, falls back to `shouldMirror: true` on any classifier error.
Uses cheapest/fastest model (haiku-class) to keep latency low.

---

## Terminal UI Layout

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ADVERSARIAL MIRROR  v1.0.0              [MODERATE]  claude vs gpt-4o           │
├─────────────────────────────────────────────────────────────────────────────────┤
│  You: Should I use microservices or a monolith for my startup?                  │
│  ── [MIRRORING] opinion_advice ─────────────────────────────────────────────    │
├──────────────────────────────┬──────────────────────────────────────────────── │
│  ORIGINAL  claude-sonnet     │  CHALLENGER  gpt-4o  [Devil's Advocate]          │
│                              │                                                   │
│  For a new startup, start    │  THE BURIED ASSUMPTION: You've already           │
│  with a monolith. Here's     │  decided to build custom infrastructure...       │
│  why: ...           ▌        │                                                 ▌ │
├──────────────────────────────┴──────────────────────────────────────────────── │
│  Tokens: 312/487  |  orig 2.1s  chal 3.4s  |  4 turns  |  ? for help           │
├─────────────────────────────────────────────────────────────────────────────────│
│  > _                                                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Narrows to stacked layout below ~100 columns. Ink handles terminal resize events.

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `@anthropic-ai/sdk ^0.32` | Claude adapter |
| `openai ^4.67` | OpenAI/Codex adapter |
| `@google/generative-ai ^0.21` | Gemini adapter |
| `ink ^5.1` | React-based terminal UI |
| `commander ^12.1` | CLI command routing |
| `zod ^3.23` | Config schema validation |
| `conf ^13` | Cross-platform config storage |
| `chalk ^5.3` | Terminal colors |
| `tiktoken ^1.0.17` | Token counting |
| `msw ^2.4` | Mock API servers for tests |
| `tsup ^8.3` | TypeScript bundler |
| `pkg ^5.8` | Standalone binary builds |

---

## Distribution

1. **npm** (primary): `npm install -g adversarial-mirror` → `mirror` command
2. **Standalone binaries** via `pkg`: linux-x64, linux-arm64, macos-x64, macos-arm64, win-x64.exe
3. **Homebrew** (Mac/Linux): `brew tap org/adversarial-mirror && brew install adversarial-mirror`
4. **Winget** (Windows): Future milestone

GitHub Actions builds all 5 binary targets on tag push and attaches to GitHub Release.

---

## Development Phases

**Phase 1 — Foundation (Weeks 1-2)**
- Project scaffold (tsconfig, tsup, vitest, eslint)
- Config schema + cross-platform storage
- BrainAdapter interface + BrainRegistry
- Anthropic adapter (non-streaming)
- Basic Ink UI (single panel)
- `mirror chat` works with Claude

**Phase 2 — Mirror Engine (Weeks 3-4)**
- Intent classifier
- Adversarial prompt builder (all 3 intensities)
- Parallel stream orchestration + mergeStreams()
- Streaming side-by-side UI
- AbortController / Ctrl+C handling
- Conversation history + token-budget truncation

**Phase 3 — All Brains (Week 5)**
- OpenAI adapter (streaming)
- Gemini adapter (streaming)
- `brains test` + `brains add` wizard
- Cross-brain mirror sessions

**Phase 4 — Polish (Weeks 6-7)**
- Narrow terminal fallback layout
- Syntax highlighting for code blocks
- `config init` wizard
- `mirror mirror` one-shot command
- History persistence + export
- Error recovery + retry logic
- `--debug` flag

**Phase 5 — Distribution (Week 8)**
- GitHub Actions CI (3 OS × Node 20/22)
- npm publish workflow
- pkg binary builds (5 targets)
- GitHub Release automation
- Homebrew formula
- README + screenshots

---

## Testing Strategy

- **Unit**: engine logic, each brain adapter, config schema, UI components (ink-testing-library)
- **Integration**: full mirror flow with MSW-mocked API responses, all 3 brain adapters
- **E2E**: `mirror --version`, `mirror --help`, `mirror mirror` with `MOCK_BRAINS=true`
- **Coverage target**: 80% lines, 70% branches
- **No real API calls in CI** — MSW intercepts all provider requests

---

## Critical Files (Implement First)

1. `src/brains/adapter.ts` — Core interface; all other files depend on this
2. `src/engine/prompt-builder.ts` — Adversarial prompts; the product's intellectual core
3. `src/engine/mirror-engine.ts` — Async generator stream merging is the hardest problem
4. `src/config/schema.ts` — Zod schema; everything reads config
5. `src/ui/components/ChatLayout.tsx` — Side-by-side vs stacked breakpoint logic
