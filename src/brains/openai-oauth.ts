import { spawn } from 'node:child_process'
import type { OAuthTokens } from '../auth/token-store.js'
import type {
  ChatOptions,
  CompletedResponse,
  ConversationMessage,
  PingResult,
  StreamChunk
} from '../types/index.js'
import type { BrainAdapter } from './adapter.js'

const BASE_URL = 'https://chatgpt.com/backend-api/codex'

// Parse the chatgpt_account_id from the id_token JWT (OIDC claim namespace)
function extractAccountId(idToken: string): string | undefined {
  try {
    const payload = idToken.split('.')[1]
    if (!payload) return undefined
    // JWT uses base64url — pad and decode
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    return decoded['https://api.openai.com/auth']?.chatgpt_account_id as string | undefined
  } catch {
    return undefined
  }
}

/**
 * Run a curl command and collect stdout as a string.
 * Uses curl instead of Node fetch to avoid Cloudflare TLS-fingerprint blocking.
 */
function curlJson(args: string[]): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('curl', ['-s', '-w', '\n__STATUS__%{http_code}', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    proc.stdout.on('data', (d: Buffer) => chunks.push(d))
    proc.on('error', reject)
    proc.on('close', () => {
      const raw = Buffer.concat(chunks).toString()
      const idx = raw.lastIndexOf('\n__STATUS__')
      const body = idx >= 0 ? raw.slice(0, idx) : raw
      const statusStr = idx >= 0 ? raw.slice(idx + 11) : '0'
      resolve({ status: parseInt(statusStr, 10), body })
    })
  })
}

/**
 * Stream a curl SSE request; yields lines as they arrive.
 */
function curlStream(
  url: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal
): { lines: AsyncIterable<string>; kill: () => void } {
  const headerArgs: string[] = []
  for (const [k, v] of Object.entries(headers)) {
    headerArgs.push('-H', `${k}: ${v}`)
  }

  const proc = spawn(
    'curl',
    ['-s', '-N', '-X', 'POST', ...headerArgs, '-d', body, url],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )

  const kill = () => proc.kill()
  signal?.addEventListener('abort', kill)

  async function* lines(): AsyncIterable<string> {
    let buffer = ''
    const decoder = new TextDecoder()

    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk as Buffer, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      for (const line of parts) {
        yield line
      }
    }
    if (buffer) yield buffer
  }

  return { lines: lines(), kill }
}

export class ChatGPTOAuthAdapter implements BrainAdapter {
  readonly id: string
  readonly provider = 'openai' as const
  readonly capabilities = { streaming: true }
  private readonly model: string
  private readonly accessToken: string
  private readonly accountId: string

  constructor(id: string, model: string, tokens: OAuthTokens) {
    this.id = id
    this.model = model
    this.accessToken = tokens.accessToken
    const accountId = tokens.idToken ? extractAccountId(tokens.idToken) : undefined
    if (!accountId) {
      throw new Error(
        `OpenAI OAuth: could not extract account ID from stored token.\n` +
        `Please re-login: mirror auth login openai`
      )
    }
    this.accountId = accountId
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      originator: 'codex_cli_rs',
      'User-Agent': 'codex_cli_rs/0.115.0 (Windows 11; x86_64) Terminal',
      'ChatGPT-Account-ID': this.accountId,
    }
  }

  async ping(): Promise<PingResult> {
    const start = Date.now()
    const headerArgs: string[] = []
    for (const [k, v] of Object.entries(this.buildHeaders())) {
      headerArgs.push('-H', `${k}: ${v}`)
    }
    try {
      const { status, body } = await curlJson([
        ...headerArgs,
        `${BASE_URL}/models?client_version=0.115.0`,
      ])
      if (status < 200 || status >= 300) {
        return { ok: false, error: `${status}: ${body.slice(0, 200)}` }
      }
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async *chat(
    messages: ConversationMessage[],
    systemPrompt: string,
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk, CompletedResponse> {
    const input = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        type: 'message',
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: [
          {
            type: m.role === 'assistant' ? 'output_text' : 'input_text',
            text: m.content,
          },
        ],
      }))

    const body: Record<string, unknown> = {
      model: this.model,
      instructions: systemPrompt,
      input,
      tools: [],
      tool_choice: 'auto',
      parallel_tool_calls: false,
      store: false,
      stream: true,
      include: [],
    }
    if (options?.maxTokens) body.max_output_tokens = options.maxTokens
    if (options?.temperature != null) body.temperature = options.temperature

    const { lines, kill } = curlStream(
      `${BASE_URL}/responses`,
      this.buildHeaders(),
      JSON.stringify(body),
      options?.signal
    )

    options?.signal?.addEventListener('abort', kill)

    let fullText = ''
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    let eventType = ''
    let errorBuf = ''

    for await (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim()
        continue
      }
      if (!line.startsWith('data: ')) {
        // Accumulate non-SSE lines to detect error responses (HTML/JSON)
        if (!line && errorBuf && !errorBuf.includes('"type"')) {
          // Blank line after non-SSE content = likely an error response
          break
        }
        errorBuf += line
        continue
      }

      const data = line.slice(6).trim()
      if (!data || data === '[DONE]') continue

      try {
        const event = JSON.parse(data)

        const type = eventType || event.type
        if (type === 'response.output_text.delta') {
          const delta: string = event.delta ?? ''
          if (delta) {
            fullText += delta
            yield { delta, isFinal: false }
          }
        } else if (type === 'response.completed') {
          const usage = event.response?.usage
          if (usage) {
            inputTokens = usage.input_tokens
            outputTokens = usage.output_tokens
          }
        } else if (type === 'error' || event.error) {
          const msg = event.message ?? event.error?.message ?? JSON.stringify(event)
          throw new Error(`ChatGPT API error: ${msg}`)
        }
      } catch (e) {
        if ((e as Error).message.startsWith('ChatGPT API error')) throw e
        // Ignore malformed SSE lines
      }
      eventType = ''
    }

    if (errorBuf && !fullText) {
      throw new Error(`ChatGPT API error: ${errorBuf.slice(0, 500)}`)
    }

    yield { delta: '', isFinal: true, inputTokens, outputTokens }
    return { text: fullText, inputTokens, outputTokens }
  }

  estimateTokens(messages: ConversationMessage[]): number {
    return messages.reduce((sum, m) => sum + m.content.length, 0)
  }

  async dispose(): Promise<void> {
    return
  }
}
