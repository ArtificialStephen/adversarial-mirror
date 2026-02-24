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
  debug?: boolean
}

export class MirrorEngine {
  private readonly original: BrainAdapter
  private readonly challenger?: BrainAdapter
  private readonly intensity: Intensity
  private readonly autoClassify: boolean
  private readonly classifier: IntentClassifier
  private readonly debug: boolean

  constructor(options: MirrorEngineOptions) {
    this.original = options.original
    this.challenger = options.challenger
    this.intensity = options.intensity
    this.autoClassify = options.autoClassify
    this.classifier = options.classifier
    this.debug = options.debug ?? false
  }

  async *run(
    userInput: string,
    history: ConversationMessage[]
  ): AsyncGenerator<MirrorEvent, void> {
    try {
      if (this.autoClassify) {
        yield { type: 'classifying' }
        let result
        try {
          result = await this.classifier.classify(userInput)
        } catch (error) {
          this.log(`Classifier error: ${(error as Error).message}`)
          result = {
            category: 'analysis' as const,
            shouldMirror: true,
            confidence: 0,
            reason: 'Classifier error; defaulting to mirror.'
          }
        }
        yield { type: 'classified', result }
        if (!result.shouldMirror || !this.challenger) {
          this.log('Classifier chose direct path.')
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
    const stream = this.streamWithRetry(this.original, messages, systemPrompt)
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
    const originalStream = this.streamWithRetry(
      this.original,
      originalMessages,
      originalPrompt
    )
    const challengerStream = this.streamWithRetry(
      this.challenger!,
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
  private async *streamWithRetry(
    adapter: BrainAdapter,
    messages: ConversationMessage[],
    systemPrompt: string,
    retries = 1
  ): AsyncGenerator<
    { delta: string; isFinal: boolean; inputTokens?: number; outputTokens?: number },
    { text: string; inputTokens?: number; outputTokens?: number }
  > {
    let attempt = 0
    while (true) {
      try {
        if (attempt > 0) {
          this.log(`Retrying ${adapter.id} (attempt ${attempt + 1}).`)
        }
        const stream = adapter.chat(messages, systemPrompt)
        for await (const chunk of stream) {
          yield chunk
        }
        return { text: '' }
      } catch (error) {
        if (attempt >= retries) {
          throw error
        }
        attempt += 1
        await delay(300 * attempt)
      }
    }
  }

  private log(message: string): void {
    if (!this.debug) {
      return
    }
    process.stderr.write(`[debug] ${message}\n`)
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
