import type {
  ConversationMessage,
  Intensity,
  MirrorEvent
} from '../types/index.js'
import type { BrainAdapter } from '../brains/adapter.js'
import type { IntentClassifier } from './intent-classifier.js'
import { buildChallengerPrompt, buildOriginalPrompt } from './prompt-builder.js'

export interface MirrorEngineOptions {
  original: BrainAdapter
  challenger?: BrainAdapter
  intensity: Intensity
  autoClassify: boolean
  classifier: IntentClassifier
}

export class MirrorEngine {
  private readonly original: BrainAdapter
  private readonly challenger?: BrainAdapter
  private readonly intensity: Intensity
  private readonly autoClassify: boolean
  private readonly classifier: IntentClassifier

  constructor(options: MirrorEngineOptions) {
    this.original = options.original
    this.challenger = options.challenger
    this.intensity = options.intensity
    this.autoClassify = options.autoClassify
    this.classifier = options.classifier
  }

  async *run(
    userInput: string,
    history: ConversationMessage[]
  ): AsyncGenerator<MirrorEvent, void> {
    try {
      if (this.autoClassify) {
        yield { type: 'classifying' }
        const result = await this.classifier.classify(userInput)
        yield { type: 'classified', result }
        if (!result.shouldMirror || !this.challenger) {
          yield* this.runSingle(userInput, history)
          return
        }
      }

      if (!this.challenger) {
        yield* this.runSingle(userInput, history)
        return
      }

      yield* this.runMirror(userInput, history)
    } catch (error) {
      yield { type: 'error', error: error as Error }
    }
  }

  private async *runSingle(
    userInput: string,
    history: ConversationMessage[]
  ): AsyncGenerator<MirrorEvent, void> {
    const messages = [...history, { role: 'user', content: userInput }]
    const systemPrompt = buildOriginalPrompt()
    const stream = this.original.chat(messages, systemPrompt)
    const accumulator = createAccumulator()

    for await (const chunk of stream) {
      accumulator.add(chunk)
      yield { type: 'stream_chunk', brainId: this.original.id, chunk }
    }

    const response = accumulator.complete()

    yield { type: 'brain_complete', brainId: this.original.id, response }
    yield { type: 'all_complete' }
  }

  private async *runMirror(
    userInput: string,
    history: ConversationMessage[]
  ): AsyncGenerator<MirrorEvent, void> {
    const originalMessages = [...history, { role: 'user', content: userInput }]
    const challengerHistory = history.map((message) =>
      message.role === 'assistant'
        ? {
            ...message,
            content: `[PREVIOUS ORIGINAL RESPONSE]\n${message.content}`
          }
        : message
    )
    const challengerMessages = [
      ...challengerHistory,
      { role: 'user', content: userInput }
    ]
    const originalPrompt = buildOriginalPrompt()
    const challengerPrompt = buildChallengerPrompt(this.intensity)
    const originalStream = this.original.chat(originalMessages, originalPrompt)
    const challengerStream = this.challenger!.chat(
      challengerMessages,
      challengerPrompt
    )

    const originalAccumulator = createAccumulator()
    const challengerAccumulator = createAccumulator()

    for await (const item of mergeStreams([
      { brainId: this.original.id, stream: originalStream, accumulator: originalAccumulator },
      {
        brainId: this.challenger!.id,
        stream: challengerStream,
        accumulator: challengerAccumulator
      }
    ])) {
      yield item
    }

    const originalResponse = originalAccumulator.complete()
    const challengerResponse = challengerAccumulator.complete()

    yield {
      type: 'brain_complete',
      brainId: this.original.id,
      response: originalResponse
    }
    yield {
      type: 'brain_complete',
      brainId: this.challenger!.id,
      response: challengerResponse
    }
    yield { type: 'all_complete' }
  }

}

type StreamChunk = {
  delta: string
  isFinal: boolean
  inputTokens?: number
  outputTokens?: number
}

interface MergeEntry {
  brainId: string
  stream: AsyncGenerator<StreamChunk, { text: string; inputTokens?: number; outputTokens?: number }>
  accumulator: ReturnType<typeof createAccumulator>
}

function createAccumulator() {
  let text = ''
  let inputTokens: number | undefined
  let outputTokens: number | undefined

  return {
    add(chunk: StreamChunk) {
      if (chunk.delta) {
        text += chunk.delta
      }
      if (chunk.inputTokens !== undefined) {
        inputTokens = chunk.inputTokens
      }
      if (chunk.outputTokens !== undefined) {
        outputTokens = chunk.outputTokens
      }
    },
    complete() {
      return { text, inputTokens, outputTokens }
    }
  }
}

async function* mergeStreams(
  entries: MergeEntry[]
): AsyncGenerator<MirrorEvent, void> {
  const pending = entries.map((entry) => ({
    entry,
    next: entry.stream.next()
  }))

  while (pending.length > 0) {
    const race = pending.map((item, index) =>
      item.next.then((result) => ({ index, result }))
    )
    const { index, result } = await Promise.race(race)
    const current = pending[index]

    if (result.done) {
      pending.splice(index, 1)
      continue
    }

    current.entry.accumulator.add(result.value)
    yield {
      type: 'stream_chunk',
      brainId: current.entry.brainId,
      chunk: result.value
    }
    current.next = current.entry.stream.next()
  }
}
