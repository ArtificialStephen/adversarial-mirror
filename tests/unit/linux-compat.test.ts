import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildExportLines, detectShellProfile } from '../../src/cli/utils/shell.js'

describe('detectShellProfile', () => {
  let originalShell: string | undefined

  beforeEach(() => {
    originalShell = process.env['SHELL']
  })

  afterEach(() => {
    if (originalShell === undefined) {
      delete process.env['SHELL']
    } else {
      process.env['SHELL'] = originalShell
    }
  })

  it('maps /bin/bash to ~/.bashrc', () => {
    process.env['SHELL'] = '/bin/bash'
    expect(detectShellProfile()).toBe(join(homedir(), '.bashrc'))
  })

  it('maps /usr/bin/bash to ~/.bashrc', () => {
    process.env['SHELL'] = '/usr/bin/bash'
    expect(detectShellProfile()).toBe(join(homedir(), '.bashrc'))
  })

  it('maps /bin/zsh to ~/.zshrc', () => {
    process.env['SHELL'] = '/bin/zsh'
    expect(detectShellProfile()).toBe(join(homedir(), '.zshrc'))
  })

  it('maps /usr/bin/zsh to ~/.zshrc', () => {
    process.env['SHELL'] = '/usr/bin/zsh'
    expect(detectShellProfile()).toBe(join(homedir(), '.zshrc'))
  })

  it('maps /usr/bin/fish to ~/.config/fish/config.fish', () => {
    process.env['SHELL'] = '/usr/bin/fish'
    expect(detectShellProfile()).toBe(join(homedir(), '.config', 'fish', 'config.fish'))
  })

  it('maps an unknown shell to ~/.profile', () => {
    process.env['SHELL'] = '/bin/dash'
    expect(detectShellProfile()).toBe(join(homedir(), '.profile'))
  })

  it('falls back to ~/.bashrc when $SHELL is unset', () => {
    delete process.env['SHELL']
    expect(detectShellProfile()).toBe(join(homedir(), '.bashrc'))
  })
})

describe('buildExportLines', () => {
  const bashProfile = join(homedir(), '.bashrc')
  const fishProfile = join(homedir(), '.config', 'fish', 'config.fish')

  it('generates export syntax for bash profile', () => {
    const lines = buildExportLines({ ANTHROPIC_API_KEY: 'sk-123' }, bashProfile)
    expect(lines).toEqual(['export ANTHROPIC_API_KEY="sk-123"'])
  })

  it('generates export syntax for zsh profile', () => {
    const zshProfile = join(homedir(), '.zshrc')
    const lines = buildExportLines({ OPENAI_API_KEY: 'sk-abc' }, zshProfile)
    expect(lines).toEqual(['export OPENAI_API_KEY="sk-abc"'])
  })

  it('generates set -Ux syntax for fish profile', () => {
    const lines = buildExportLines({ ANTHROPIC_API_KEY: 'sk-123' }, fishProfile)
    expect(lines).toEqual(['set -Ux ANTHROPIC_API_KEY "sk-123"'])
  })

  it('handles multiple vars', () => {
    const lines = buildExportLines(
      { ANTHROPIC_API_KEY: 'sk-ant', OPENAI_API_KEY: 'sk-oai' },
      bashProfile
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('export ANTHROPIC_API_KEY="sk-ant"')
    expect(lines[1]).toBe('export OPENAI_API_KEY="sk-oai"')
  })

  it('handles multiple vars for fish', () => {
    const lines = buildExportLines(
      { ANTHROPIC_API_KEY: 'sk-ant', OPENAI_API_KEY: 'sk-oai' },
      fishProfile
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('set -Ux ANTHROPIC_API_KEY "sk-ant"')
    expect(lines[1]).toBe('set -Ux OPENAI_API_KEY "sk-oai"')
  })

  it('returns empty array for empty vars', () => {
    expect(buildExportLines({}, bashProfile)).toEqual([])
  })
})
