import { createHash, randomBytes } from 'node:crypto'

export interface PKCEPair {
  codeVerifier: string
  codeChallenge: string
}

export function generatePKCE(): PKCEPair {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
  return { codeVerifier, codeChallenge }
}
