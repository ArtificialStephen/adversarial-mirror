# Adversarial Mirror

A CLI middleware that forks every prompt to two AI models in parallel — an **original** brain and an **adversarial challenger** — then streams both responses side-by-side in real time.

**Why:** Every AI model has systematic blind spots. The challenger is explicitly prompted to surface flaws, hidden assumptions, and counter-arguments that you'll never get from a single model. Combats AI sycophancy and echo chambers.

```
Your question
    │
    ├── factual / code / math ──► single brain (direct)
    │
    └── opinion / analysis / prediction ──► parallel fork
            ├── Brain A: standard answer
            └── Brain B: adversarial challenge ← the differentiator
```

## Install

```bash
npm install -g adversarial-mirror
```

Run the setup wizard once:

```bash
mirror config init
```

## Quick start

```bash
# Interactive chat
mirror chat

# One-shot (exits after response)
mirror mirror "Should I use microservices or a monolith for my startup?"

# Crank up the pressure
mirror chat --intensity aggressive
```

## Adversarial intensity levels

| Level | Style | What the challenger does |
|---|---|---|
| `mild` | Gentle critic | Full answer + 1-2 genuine gaps + steelman |
| `moderate` | Devil's advocate | Reframe → challenge the frame → hidden costs → strongest counterposition → verdict |
| `aggressive` | Full adversarial | Buried assumption → strongest refutation → failure cases → expert dissent → synthesis |

All levels enforce: *"Every point must have a specific mechanism. Vague doubt is useless."*

## Commands

```
mirror chat                        Interactive session (default)
mirror mirror "<question>"         One-shot query, exits after response
mirror config init                 Interactive setup wizard
mirror config show                 Show current config (keys are visible)
mirror config set <key> <value>    Set a config value by dot-path
mirror brains list                 List configured AI brains
mirror brains test <id>            Ping a brain to verify connection
mirror brains add                  Add a new brain interactively
mirror history list                List past sessions
mirror history show <id>           Show a past session as JSON
mirror history export <id> <file>  Export session to a JSON file

Global flags:
  --intensity mild|moderate|aggressive
  --original <brain-id>
  --challenger <brain-id>
  --no-mirror         Disable mirroring (single brain mode)
  --no-classify       Skip intent classification, always mirror
  --debug             Enable verbose debug output
```

## Configuration

Config is stored at:
- **macOS/Linux:** `~/.config/adversarial-mirror/config.json`
- **Windows:** `%APPDATA%\adversarial-mirror\config.json`

API keys are read from environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=AIza...
```

## Supported providers

| Provider | Example models | Env var |
|---|---|---|
| Anthropic | `claude-sonnet-4-6`, `claude-opus-4-6` | `ANTHROPIC_API_KEY` |
| OpenAI | `gpt-4o`, `o3-mini`, `o3` | `OPENAI_API_KEY` |
| Google | `gemini-2.5-pro`, `gemini-1.5-pro` | `GOOGLE_API_KEY` |

**Tip:** `o3-mini` is the recommended challenger brain if you have OpenAI access. Its step-by-step reasoning produces sharper adversarial analysis than `gpt-4o`. To switch:

```bash
mirror config set session.challengerBrainId o3-mini
```

Mix and match — the original and challenger can use different providers.

## How the terminal UI works

Completed exchanges are rendered **once** and stamped permanently into the terminal's scroll buffer (using Ink's `Static` component). Only the currently-streaming panels update. This means:

- History never flickers or redraws on resize
- You can scroll up to read previous exchanges at any time
- The dynamic area stays small: just the live streaming panels + input

## Development

```bash
git clone https://github.com/StephenMarullo/adversarial-mirror
cd adversarial-mirror
npm install
npm run build
npm test
```

Run tests without real API keys:

```bash
MOCK_BRAINS=true npm test
```

Watch mode:

```bash
npm run dev
```

## Building standalone binaries

```bash
npm run build
npm run package
# outputs: dist/pkg/mirror-linux-x64, mirror-macos-arm64, mirror-win-x64.exe, etc.
```

## CI

Every push runs the full test suite on Ubuntu, macOS, and Windows across Node.js 20 and 22. Tagged releases automatically publish to npm and attach pre-built binaries to the GitHub Release.

## License

MIT
