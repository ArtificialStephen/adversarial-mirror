<pre>
<span style="color:#00D2FF"> ________                             _____ ______   ___  ________  ________  ________  ________     </span>
<span style="color:#3A7BD5">|\   __  \                           |\   _ \  _   \|\  \|\   __  \|\   __  \|\   __  \|\   __  \    </span>
<span style="color:#7F5AF0">\ \  \|\  \        ____________      \ \  \\\__\ \  \ \  \ \  \|\  \ \  \|\  \ \  \|\  \ \  \|\  \   </span>
<span style="color:#FF6EC7"> \ \   __  \      |\____________\     \ \  \\|__| \  \ \  \ \   _  _\ \   _  _\ \  \\\  \ \   _  _\  </span>
<span style="color:#FFB86C">  \ \  \ \  \     \|____________|      \ \  \    \ \  \ \  \ \  \\  \\ \  \\  \\ \  \\\  \ \  \\  \| </span>
<span style="color:#3A7BD5">   \ \__\ \__\                          \ \__\    \ \__\ \__\ \__\\ _\\ \__\\ _\\ \_______\ \__\\ _\ </span>
<span style="color:#00D2FF">    \|__|\|__|                           \|__|     \|__|\|__|\|__|\|__|\|__|\|__|\|_______|\|__|\|__|</span>
</pre>

# Adversarial Mirror

A terminal-first CLI that mirrors every prompt to two models in parallel and shows the original, the adversarial challenger, and an optional judge synthesis in real time.

**Why it works**
- The challenger is forced to surface blind spots and counter-arguments instead of echoing you.
- The judge synthesizes both answers and calls out what both missed.
- The UI is built for focus: completed exchanges are stamped into the scrollback, only the live panels update.

## Install

```bash
npm install -g adversarial-mirror
```

Run the setup wizard once:

```bash
mirror config init
```

## Quick Start

```bash
# Default command is chat
mirror

# Interactive chat
mirror chat

# One-shot (exits after response)
mirror mirror "Should I use microservices or a monolith for my startup?"

# Increase adversarial pressure
mirror --intensity aggressive

# Run a specific persona lens
mirror --persona security-auditor

# Disable the judge synthesis pass
mirror --no-judge

# Load file context before a session
mirror chat --file ./notes.md

# Provide file context for a one-shot
mirror mirror --file ./spec.md "Summarize risks"

# Pipe stdin into the one-shot
cat ./spec.md | mirror mirror "Summarize risks"
```

## How It Works

Adversarial Mirror classifies each prompt and decides whether to mirror or answer directly.

- **Direct mode**: one model answers normally.
- **Mirror mode**: original + challenger answer in parallel.
- **Judge mode** (optional): a third model scores agreement and produces a synthesis + blind spot.

## Intensity Levels

| Level | Challenger style | What it does |
|---|---|---|
| `mild` | Gentle critic | Full answer + 1–2 real gaps + steelman |
| `moderate` | Devil's advocate | Reframe ? challenge the frame ? hidden costs ? strongest counterposition ? verdict |
| `aggressive` | Full adversarial | Buried assumption ? strongest refutation ? failure cases ? expert dissent ? honest synthesis |

All levels enforce: “Every point must have a specific mechanism. Vague doubt is useless.”

## Persona Lenses

Personas give the challenger a professional lens:

| Persona | Lens |
|---|---|
| `vc-skeptic` | Investor scrutiny and defensibility |
| `security-auditor` | Attack surfaces and failure modes |
| `end-user` | Adoption friction and real-world behavior |
| `regulator` | Compliance exposure and liability |
| `contrarian` | Pure opposition and inverted premise |

Use a persona with `--persona <name>` or set a default in config.

## Judge Synthesis

The judge pass is enabled by default. It produces:
- An agreement score (0–100%).
- A synthesis verdict that weighs both answers.
- A blind spot section that names what both missed.

Flags:
- `--no-judge` disables the judge.
- `--judge-brain <id>` selects a specific brain for judging.

## Commands

```
mirror                                   Default to chat
mirror chat                              Interactive session
mirror mirror "<question>"               One-shot query
mirror config init                       Interactive setup wizard
mirror config show                       Show current config
mirror config set <key> <value>          Set a config value by dot-path
mirror brains list                       List configured brains
mirror brains test <id>                  Ping a brain to verify connection
mirror brains add                        Add a new brain interactively
mirror history list                      List past sessions
mirror history show <id>                 Show a past session as JSON
mirror history export <id> <file>        Export session to a JSON file

Global flags:
  --intensity mild|moderate|aggressive
  --original <brain-id>
  --challenger <brain-id>
  --no-mirror
  --no-classify
  --no-judge
  --judge-brain <brain-id>
  --persona <name>
  --debug
```

## Configuration

Config location:
- macOS/Linux: `~/.config/adversarial-mirror/config.json`
- Windows: `%APPDATA%\adversarial-mirror\config.json`

`mirror config init` can prompt for API keys and optionally persist them.
- Windows uses `setx`.
- Non-Windows will prompt you to export in your shell profile.

## Supported Providers

| Provider | Example models | Env var |
|---|---|---|
| Anthropic | `claude-sonnet-4-6`, `claude-opus-4-6` | `ANTHROPIC_API_KEY` |
| OpenAI | `gpt-4o`, `o3-mini`, `o3` | `OPENAI_API_KEY` |
| Google | `gemini-2.5-pro`, `gemini-1.5-pro` | `GOOGLE_API_KEY` |

Mix and match providers for original, challenger, and judge.

## Terminal UI

- The header and completed exchanges are rendered via Ink’s `Static`, so they never redraw or flicker.
- Only the live streaming panels update during a request.
- Streaming output is trimmed to recent lines to keep the dynamic area stable.

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

Coverage:

```bash
npm run test:coverage
```

Watch mode:

```bash
npm run dev
```

## Building Standalone Binaries

```bash
npm run build
npm run package
```

## License

MIT