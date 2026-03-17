import { writeFile } from 'node:fs/promises'
import type { HistoryEntry } from '../../types/index.js'
import { getHistory, listHistory } from '../../history/store.js'

export function runHistoryList(): void {
  const entries = listHistory()
  if (entries.length === 0) {
    process.stdout.write('No history yet.\n')
    return
  }

  process.stdout.write('ID\tCREATED\tQUESTION\n')
  for (const entry of entries) {
    const question = entry.question.length > 80
      ? `${entry.question.slice(0, 77)}...`
      : entry.question
    process.stdout.write(`${entry.id}\t${entry.createdAt}\t${question}\n`)
  }
}

export function runHistoryShow(id: string): void {
  const entry = getHistory(id)
  if (!entry) {
    process.stderr.write(`History entry not found: ${id}\n`)
    process.exit(1)
  }

  process.stdout.write(JSON.stringify(entry, null, 2))
  process.stdout.write('\n')
}

function formatHistoryMarkdown(entry: HistoryEntry): string {
  const lines: string[] = []

  lines.push(`# ${entry.question}`)
  lines.push('')
  lines.push(`*${new Date(entry.createdAt).toLocaleString()}*`)
  lines.push('')

  if (entry.intent) {
    const mirror = entry.intent.shouldMirror ? 'mirrored' : 'direct'
    const conf = Math.round(entry.intent.confidence * 100)
    lines.push(`> **Intent:** \`${entry.intent.category}\` · ${conf}% confidence · ${mirror}`)
    lines.push('')
  }

  if (entry.agreementScore !== undefined) {
    lines.push(`> **Agreement:** ${entry.agreementScore}%`)
    lines.push('')
  }

  lines.push(`## Original (${entry.original.brainId})`)
  lines.push('')
  lines.push(entry.original.text)
  lines.push('')

  if (entry.challenger) {
    lines.push(`## Challenger (${entry.challenger.brainId})`)
    lines.push('')
    lines.push(entry.challenger.text)
    lines.push('')
  }

  if (entry.synthesis) {
    lines.push('## Synthesis')
    lines.push('')
    lines.push(entry.synthesis)
    lines.push('')
  }

  return lines.join('\n')
}

export async function runHistoryExport(
  id: string,
  file: string,
  options: { format?: string }
): Promise<void> {
  const entry = getHistory(id)
  if (!entry) {
    process.stderr.write(`History entry not found: ${id}\n`)
    process.exit(1)
  }

  const fmt = options.format ?? (file.endsWith('.md') ? 'markdown' : 'json')
  const payload = (fmt === 'markdown' || fmt === 'md')
    ? formatHistoryMarkdown(entry)
    : JSON.stringify(entry, null, 2)

  await writeFile(file, payload)
  process.stdout.write(`Exported history ${id} to ${file} (${fmt}).\n`)
}
