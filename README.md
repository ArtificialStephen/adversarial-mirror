<pre>
<span style="color:#00D2FF"> ________                             _____ ______   ___  ________  ________  ________  ________     </span>
<span style="color:#3A7BD5">|\   __  \                           |\   _ \  _   \|\  \|\   __  \|\   __  \|\   __  \|\   __  \    </span>
<span style="color:#7F5AF0">\ \  \|\  \        ____________      \ \  \\\__\ \  \ \  \ \  \|\  \ \  \|\  \ \  \|\  \ \  \|\  \   </span>
<span style="color:#FF6EC7"> \ \   __  \      |\____________\     \ \  \\|__| \  \ \  \ \   _  _\ \   _  _\ \  \\\  \ \   _  _\  </span>
<span style="color:#FFB86C">  \ \  \ \  \     \|____________|      \ \  \    \ \  \ \  \ \  \\  \\ \  \\  \\ \  \\\  \ \  \\  \| </span>
<span style="color:#3A7BD5">   \ \__\ \__\                          \ \__\    \ \__\ \__\ \__\\ _\\ \__\\ _\\ \_______\ \__\\ _\ </span>
<span style="color:#00D2FF">    \|__|\|__|                           \|__|     \|__|\|__|\|__|\|__|\|__|\|__|\|_______|\|__|\|__|</span>
</pre>

<div align="center">

**A terminal-first adversarial AI layer that forks every prompt to two models in parallel,<br>forces a challenger to find flaws, and synthesizes the verdict in real time.**

![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![Build](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square)

</div>

---

## The problem it solves

Every AI gives you the answer it thinks you want to hear. Adversarial Mirror sits between you and your models and **forces a second model to challenge the first one**. Not to be contrary for the sake of it — to surface the assumptions you didn't know you were making, the risks you didn't ask about, and the alternatives you didn't consider.

```
  Your prompt
      │
      ▼
  ┌───────────────┐
  │  Classifier   │  ← Is this a question with a correct answer?
  └───────────────┘         (factual / math / code → direct mode)
      │
  ┌───┴───┐
  ▼       ▼
Original  Challenger   ← streams both in parallel
  │             │
  └──────┬──────┘
         ▼
       Judge          ← agreement score + synthesis + blind spot
```

The output is a living terminal session. Completed exchanges stamp themselves permanently into the scrollback. Only the live panels update while models are streaming.

---

## Install

```bash
npm install -g adversarial-mirror
```

Or build from source:

```bash
git clone https://github.com/StephenMarullo/adversarial-mirror
cd adversarial-mirror
npm install && npm run build
npm link
```

Then run the one-time setup wizard:

```bash
mirror config init
```

This walks you through API keys, default brains, intensity, and judge settings. Keys are persisted to environment variables (`setx` on Windows, shell profile export on Unix).

---

## Quick start

```bash
# Open an interactive session (default command)
mirror

# One-shot query — prints and exits
mirror mirror "Should I rewrite this in Rust?"

# Turn up the pressure
mirror --intensity aggressive

# Apply a professional lens
mirror --persona security-auditor

# Load a document as context before you start typing
mirror chat --file ./architecture.md

# One-shot with a file
mirror mirror --file ./spec.md "What are the risks?"

# Pipe anything in
cat proposal.md | mirror mirror "Challenge every assumption"

# Disable the judge to go faster
mirror --no-judge

# Use different models than your defaults
mirror --original claude-sonnet-4-6 --challenger o3-mini --judge-brain claude-opus-4-6
```

---

## How it works

### Intent classification

Before routing a prompt, the engine classifies it. Questions with objectively correct answers (facts, math, code) go to the original model alone — mirroring them wastes tokens and adds noise. Open-ended prompts (opinion, analysis, prediction, strategy) get the full adversarial treatment.

| Category | Example | Routed to |
|---|---|---|
| `factual_lookup` | "What year was Redis released?" | Direct |
| `math_computation` | "What is 17% of 4200?" | Direct |
| `code_task` | "Write a binary search in Go" | Direct |
| `opinion_advice` | "Should I use microservices?" | Mirror |
| `analysis` | "What are the risks of this architecture?" | Mirror |
| `prediction` | "Will this approach scale to 10M users?" | Mirror |
| `interpretation` | "What does this contract clause mean?" | Mirror |

Classification uses a small fast model (Claude Haiku by default) with a confidence threshold. Prompts below threshold default to mirroring. Disable with `--no-classify` to always mirror.

---

### Intensity levels

Controls how hard the challenger pushes back.

| Level | Style | Structure |
|---|---|---|
| `mild` | Gentle critic | Complete answer + 1-2 real gaps + steelman alternative |
| `moderate` | Devil's advocate | Reframe / challenge the frame / hidden costs / strongest counterposition / verdict |
| `aggressive` | Full adversarial | Buried assumption / strongest refutation / failure cases / expert dissent / honest synthesis |

All levels enforce one rule: **every point must have a specific mechanism. Vague doubt is useless.**

```bash
mirror --intensity mild      # good for quick sanity checks
mirror --intensity moderate  # default — the sweet spot
mirror --intensity aggressive # use when the stakes are high
```

---

### Persona lenses

Personas give the challenger a professional frame of reference. Instead of generic adversarialism, you get a specific expert's skepticism applied to your prompt.

| Persona | Lens | Focus |
|---|---|---|
| `vc-skeptic` | Investor | Market size assumptions, unit economics, moat, defensibility |
| `security-auditor` | Security & risk | Attack surfaces, trust boundaries, failure modes, blast radius |
| `end-user` | Real user | Actual behavior vs stated intent, adoption friction, miscomprehension |
| `regulator` | Compliance & legal | Regulatory exposure, liability, stakeholder harm, unintended consequences |
| `contrarian` | Pure opposition | Historical failures, second-order effects, inverted premises, consensus traps |

Personas compose with intensity levels — you get 15 distinct challenger modes total:

```bash
mirror --persona vc-skeptic --intensity aggressive   # full venture-style destruction
mirror --persona security-auditor                    # defaults to moderate intensity
mirror --persona regulator --file ./terms.md chat    # load a doc first, then go
```

Set a default persona so you never have to type it:

```bash
mirror config set session.defaultPersona vc-skeptic
```

---

### Judge synthesis

After both models complete, a third model synthesizes their responses and produces a structured verdict:

```
AGREEMENT: 34%
Both models agree on the technical approach but diverge sharply on timeline and risk.

SYNTHESIS
The monolith wins short-term. The challenger's concern about coupling is real but premature
at your current scale. Revisit at 50k DAU. The original underestimates the ops cost of
distributed tracing; budget 2 sprints for observability before you ship anything.

BLIND SPOT
Neither model addressed the team's existing expertise. The "right" architecture is the one
your engineers can actually debug at 3am.
```

The agreement score (0-100%) gives you a quick read on how contested the territory is:

| Score | Meaning |
|---|---|
| 90-100% | Substantively identical — both models see the same thing |
| 70-89% | Same core answer, meaningful differences in emphasis or caveats |
| 50-69% | Partial overlap — worth reading both carefully |
| 30-49% | Different conclusions from shared premises |
| 0-29% | Fundamentally opposed — the question is genuinely hard |

```bash
mirror --no-judge         # skip synthesis, go faster
mirror --judge-brain claude-opus-4-6   # use a heavier model for synthesis
mirror config set session.judgeBrainId o3-mini
```

---

### File and pipe input

Load any document as context before a session or one-shot query.

```bash
# Interactive session with a document preloaded
mirror chat --file ./notes.md
mirror chat --file ./architecture.md

# One-shot with file context
mirror mirror --file ./contract.md "What clauses expose us to liability?"
mirror mirror --file ./codebase-summary.md "Where are the security risks?"

# Pipe from stdin
cat ./spec.md | mirror mirror "What are the weakest assumptions here?"
git diff HEAD~1 | mirror mirror "Review this diff"
curl -s https://api.example.com/openapi.json | mirror mirror "What could go wrong with this API design?"
```

---

## Commands

```
mirror                                   Open interactive chat (default)
mirror chat                              Interactive multi-turn session
mirror chat --file <path>                Preload a file as conversation context
mirror mirror "<question>"               One-shot query, print and exit
mirror mirror --file <path> "<question>" One-shot with file context

mirror config init                       Interactive setup wizard
mirror config show                       Print current config as JSON
mirror config set <key> <value>          Set a config value by dot-path

mirror brains list                       List configured brains
mirror brains test <id>                  Ping a brain to verify connection
mirror brains add                        Add a new brain interactively

mirror history list                      List saved sessions
mirror history show <id>                 Print a saved session as JSON
mirror history export <id> <file>        Export a session to a file
```

---

## Global flags

These apply to every command and can be combined freely:

```
--intensity mild|moderate|aggressive   Adversarial pressure level (default: moderate)
--original <brain-id>                  Override the original brain
--challenger <brain-id>                Override the challenger brain
--judge-brain <brain-id>               Override the judge brain
--persona <name>                       Apply a persona lens to the challenger
--no-mirror                            Disable mirroring, answer directly
--no-classify                          Skip intent classification, always mirror
--no-judge                             Disable judge synthesis pass
--debug                                Print debug info to stderr
```

---

## Configuration

Config is stored at:
- **macOS / Linux:** `~/.config/adversarial-mirror/config.json`
- **Windows:** `%APPDATA%\adversarial-mirror\config.json`

Run `mirror config init` to set everything up interactively. You can also set individual values:

```bash
mirror config set session.defaultIntensity aggressive
mirror config set session.defaultPersona security-auditor
mirror config set session.challengerBrainId o3-mini
mirror config set session.judgeEnabled false
mirror config set ui.showTokenCounts true
mirror config set ui.showLatency true
mirror config set ui.syntaxHighlighting true
```

View the full current config at any time:

```bash
mirror config show
```

---

## Supported providers

Mix and match any provider for original, challenger, and judge independently.

| Provider | Models | Env var |
|---|---|---|
| **Anthropic** | `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` |
| **OpenAI** | `gpt-4o`, `o3-mini`, `o3` | `OPENAI_API_KEY` |
| **Google** | `gemini-2.5-pro`, `gemini-1.5-pro` | `GOOGLE_API_KEY` |

Add a brain with `mirror brains add` or edit the config JSON directly. Each brain entry looks like:

```json
{
  "id": "my-o3",
  "provider": "openai",
  "model": "o3",
  "apiKeyEnvVar": "OPENAI_API_KEY"
}
```

A few combinations worth calling out:

```bash
# Heavyweight adversarial setup
mirror --original claude-opus-4-6 --challenger o3 --judge-brain claude-opus-4-6

# Fast and cheap
mirror --original claude-sonnet-4-6 --challenger o3-mini --no-judge

# Cross-company sanity check
mirror --original claude-sonnet-4-6 --challenger gemini-2.5-pro
```

---

## Terminal UI

The interface is built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal).

- **Completed exchanges** are written permanently to the scrollback via Ink's `Static` — they never redraw or flicker, even when models are streaming
- **Live panels** update as tokens arrive, batched at 60ms to stay smooth
- **Side-by-side layout** activates automatically at terminal widths >= 80 columns
- **Syntax highlighting** in code blocks
- **Agreement score** in the judge panel header
- Token counts and latency visible via `mirror config set ui.showTokenCounts true`

```
Ctrl+C while idle    → exit
Ctrl+C while thinking → cancel current request
```

---

## Development

```bash
git clone https://github.com/StephenMarullo/adversarial-mirror
cd adversarial-mirror
npm install

npm run build          # compile to dist/
npm run dev            # watch mode
npm test               # run test suite (122 tests)
npm run test:coverage  # coverage report
npm run test:watch     # vitest watch mode
```

Run without real API keys using the mock adapter:

```bash
MOCK_BRAINS=true node dist/cli.js chat
MOCK_BRAINS=true node dist/cli.js --persona vc-skeptic mirror "my startup idea"
MOCK_BRAINS=true node dist/cli.js mirror --file README.md "What are the risks?"
echo "test input" | MOCK_BRAINS=true node dist/cli.js mirror "analyze this"
```

Build standalone binaries (requires `@yao-pkg/pkg`):

```bash
npm run build
npm run package
# outputs to dist/pkg/ for win-x64, linux-x64, linux-arm64, macos-x64, macos-arm64
```

---

## License

MIT
