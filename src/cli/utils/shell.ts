import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Detects the most appropriate shell profile file for the current user.
 * Uses the $SHELL environment variable and maps it to the conventional
 * rc/profile file for that shell.
 */
export function detectShellProfile(): string {
  const shell = process.env['SHELL'] ?? '/bin/bash'
  const base = shell.split('/').pop() ?? 'bash'
  const home = homedir()

  if (base === 'zsh') return join(home, '.zshrc')
  if (base === 'fish') return join(home, '.config', 'fish', 'config.fish')
  if (base === 'bash') return join(home, '.bashrc')
  return join(home, '.profile')
}

/**
 * Builds the shell export lines appropriate for the detected profile file.
 * Fish shell uses `set -Ux` syntax; all others use `export KEY="value"`.
 */
export function buildExportLines(
  vars: Record<string, string>,
  profile: string
): string[] {
  const isFish = profile.endsWith('config.fish')
  return Object.entries(vars).map(([key, value]) =>
    isFish ? `set -Ux ${key} "${value}"` : `export ${key}="${value}"`
  )
}
