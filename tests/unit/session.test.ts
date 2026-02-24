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

  it('truncates oldest messages when exceeding maxHistory', () => {
    const s = new Session(3)
    s.addUser('q1')
    s.addAssistant('a1')
    s.addUser('q2')
    s.addAssistant('a2') // now 4 messages, limit 3 → oldest evicted
    const history = s.getHistory()
    expect(history).toHaveLength(3)
    expect(history[0]).toEqual({ role: 'assistant', content: 'a1' })
  })

  it('clear empties all messages', () => {
    const s = new Session()
    s.addUser('hello')
    s.addAssistant('world')
    s.clear()
    expect(s.getHistory()).toHaveLength(0)
  })

  it('respects a window of 1 (just the most recent message)', () => {
    const s = new Session(1)
    s.addUser('first')
    s.addUser('second')
    const history = s.getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].content).toBe('second')
  })
})
