# Homebrew Formula

Generate the Homebrew formula after a tagged release has produced assets.

Example:

```bash
GITHUB_TOKEN=... node scripts/generate-homebrew.mjs v0.1.0
```

This writes `homebrew/adversarial-mirror.rb` with correct URLs and sha256 values.
