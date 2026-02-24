# Adversarial Mirror

Adversarial Mirror is a CLI middleware that sends each prompt to an original model and an adversarial challenger. It surfaces blind spots, counterarguments, and weak assumptions instead of echoing a single model's answer.

## Quickstart

```bash
npm install
npm run build
node dist/cli.js chat
```

Or run the CLI via `tsup` in watch mode:

```bash
npm run dev
node dist/cli.js chat
```

## Configuration

Config is stored at:
- macOS/Linux: `~/.config/adversarial-mirror/config.json`
- Windows: `%APPDATA%\adversarial-mirror\config.json`

Initialize with the wizard:

```bash
node dist/cli.js config init
```

Show config:

```bash
node dist/cli.js config show
```

Set a config value:

```bash
node dist/cli.js config set session.defaultIntensity aggressive
```

## Commands

- `mirror chat` — Interactive session
- `mirror mirror "question"` — One-shot query
- `mirror config show` — Print config
- `mirror config init` — Interactive setup wizard
- `mirror config set <key> <value>`
- `mirror brains list|test|add`
- `mirror history list|show|export`

## Environment Variables

Each brain uses an API key env var defined in config:

- Anthropic: `ANTHROPIC_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Gemini: `GOOGLE_API_KEY`

Use `MOCK_BRAINS=true` to run without real API calls.

## Packaging

Build standalone binaries with `pkg`:

```bash
npm run build
npm run package
```

Output lives in `dist/pkg`.

## Development

Tests:

```bash
npm test
```

## License

MIT
