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
    if (this.messages.length > this.maxHistory) {
      this.messages.splice(0, this.messages.length - this.maxHistory)
    }
  }
}
