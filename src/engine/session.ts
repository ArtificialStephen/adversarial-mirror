import type { ConversationMessage } from '../types/index.js'

export class Session {
  private readonly maxHistory: number
  private readonly messages: ConversationMessage[] = []

  constructor(maxHistory = 20) {
    this.maxHistory = maxHistory
  }

  addUser(content: string): void {
    this.push({ role: 'user', content })
  }

  addAssistant(content: string): void {
    this.push({ role: 'assistant', content })
  }

  getHistory(): ConversationMessage[] {
    return [...this.messages]
  }

  clear(): void {
    this.messages.length = 0
  }

  private push(message: ConversationMessage): void {
    this.messages.push(message)
    // Evict oldest Q&A pair at a time so the buffer never starts with an
    // assistant message that has no preceding user turn (which causes API errors).
    while (this.messages.length > this.maxHistory) {
      this.messages.splice(0, 2)
    }
  }
}
