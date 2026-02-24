import { describe, expect, it } from 'vitest'
import { Session } from '../../src/engine/session.js'

describe('Session', () => {
  it('stores messages in insertion order', () => {
    const s = new Session()
    s.addUser('hello')
    s.addAssistant('world')
    const history = s.getHistory()
    expect(history).toHaveLength(2)
    expect(history[0]).toEqual({ role: 'user', content: 'hello' })
    expect(history[1]).toEqual({ role: 'assistant', content: 'world' })
  })

  it('getHistory returns a shallow copy — not the internal array', () => {
    const s = new Session()
    s.addUser('q')
    const h1 = s.getHistory()
    const h2 = s.getHistory()
    expect(h1).not.toBe(h2)
    h1.push({ role: 'user', content: 'injected' })
    expect(s.getHistory()).toHaveLength(1)
  })

  it('does not truncate when under the window limit', () => {
    const s = new Session(5)
    s.addUser('a')
    s.addUser('b')
    s.addUser('c')
    expect(s.getHistory()).toHaveLength(3)
  })

  it('evicts the oldest Q&A pair when exceeding maxHistory', () => {
    // maxHistory=4 with 2 pairs: fits exactly. Adding a 3rd pair evicts the first.
    const s = new Session(4)
    s.addUser('q1')
    s.addAssistant('a1')
    s.addUser('q2')
    s.addAssistant('a2')
    s.addUser('q3')
    s.addAssistant('a3') // 6 messages → evict pair 1 → [q2, a2, q3, a3]
    const history = s.getHistory()
    expect(history).toHaveLength(4)
    expect(history[0]).toEqual({ role: 'user', content: 'q2' })
    expect(history[history.length - 1]).toEqual({ role: 'assistant', content: 'a3' })
  })

  it('history never starts with an assistant message', () => {
    // Pair eviction means we may drop below maxHistory to avoid orphaned responses.
    const s = new Session(3) // odd limit — pairs of 2 cannot fill exactly
    s.addUser('q1')
    s.addAssistant('a1')
    s.addUser('q2')
    s.addAssistant('a2') // 4 messages > 3 → evict pair → [q2, a2]
    const history = s.getHistory()
    expect(history[0].role).toBe('user')
  })

  it('clear empties all messages', () => {
    const s = new Session()
    s.addUser('hello')
    s.addAssistant('world')
    s.clear()
    expect(s.getHistory()).toHaveLength(0)
  })

  it('keeps the most recent pair when window equals one pair', () => {
    const s = new Session(2)
    s.addUser('q1')
    s.addAssistant('a1')
    s.addUser('q2')
    s.addAssistant('a2') // evicts first pair → [q2, a2]
    const history = s.getHistory()
    expect(history).toHaveLength(2)
    expect(history[0].content).toBe('q2')
    expect(history[1].content).toBe('a2')
  })
})
