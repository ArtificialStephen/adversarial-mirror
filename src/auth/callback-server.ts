import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

export interface CallbackResult {
  code: string
  state: string
}

export function startCallbackServer(
  port: number,
  expectedState: string,
  callbackPath = '/callback'
): { waitForCode: () => Promise<CallbackResult>; close: () => void } {
  let resolveCode!: (result: CallbackResult) => void
  let rejectCode!: (err: Error) => void
  const promise = new Promise<CallbackResult>((res, rej) => {
    resolveCode = res
    rejectCode = rej
  })

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    if (url.pathname !== callbackPath) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      res.writeHead(400)
      res.end(`OAuth error: ${error}`)
      rejectCode(new Error(`OAuth error: ${error}`))
      server.close()
      return
    }

    if (!code) {
      res.writeHead(400)
      res.end('Missing authorization code')
      return
    }

    if (state !== expectedState) {
      res.writeHead(400)
      res.end('State mismatch — possible CSRF')
      rejectCode(new Error('OAuth state mismatch'))
      server.close()
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<html><body style="font-family:sans-serif;padding:2rem"><h2>✓ Authorization successful!</h2><p>You can close this tab and return to the terminal.</p></body></html>')
    resolveCode({ code, state })
    server.close()
  })

  server.listen(port)

  return {
    waitForCode: () => promise,
    close: () => server.close(),
  }
}

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, () => {
      const addr = srv.address()
      srv.close(() => {
        if (addr && typeof addr === 'object') {
          resolve(addr.port)
        } else {
          reject(new Error('Could not find a free port'))
        }
      })
    })
  })
}
