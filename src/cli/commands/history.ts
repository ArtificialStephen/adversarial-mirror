import { writeFile } from 'node:fs/promises'
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

export async function runHistoryExport(id: string, file: string): Promise<void> {
  const entry = getHistory(id)
  if (!entry) {
    process.stderr.write(`History entry not found: ${id}\n`)
    process.exit(1)
  }

  const payload = JSON.stringify(entry, null, 2)
  await writeFile(file, payload)
  process.stdout.write(`Exported history ${id} to ${file}.\n`)
}
