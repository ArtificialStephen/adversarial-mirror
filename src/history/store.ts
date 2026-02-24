import Conf from 'conf'
import type { HistoryEntry } from '../types/index.js'

interface HistoryStore {
  entries: HistoryEntry[]
}

const store = new Conf<HistoryStore>({
  projectName: 'adversarial-mirror',
  configName: 'history',
  defaults: { entries: [] }
})

const MAX_ENTRIES = 200

export function addHistoryEntry(entry: HistoryEntry): void {
  const entries = store.store.entries ?? []
  const next = [entry, ...entries]
  if (next.length > MAX_ENTRIES) {
    next.length = MAX_ENTRIES
  }
  store.store = { entries: next }
}

export function listHistory(): HistoryEntry[] {
  return store.store.entries ?? []
}

export function getHistory(id: string): HistoryEntry | undefined {
  return (store.store.entries ?? []).find((entry) => entry.id === id)
}
