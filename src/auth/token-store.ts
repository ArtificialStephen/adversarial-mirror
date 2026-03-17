import Conf from 'conf'

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: number  // epoch ms
  idToken?: string    // OpenID Connect id_token JWT (OpenAI only)
  projectId?: string  // Google Cloud project ID (Gemini OAuth only)
}

const store = new Conf<Record<string, OAuthTokens>>({
  projectName: 'adversarial-mirror',
  configName: 'oauth-tokens',
})

export function saveTokens(provider: string, tokens: OAuthTokens): void {
  store.set(provider, tokens)
}

export function loadTokens(provider: string): OAuthTokens | undefined {
  return store.get(provider) as OAuthTokens | undefined
}

export function deleteTokens(provider: string): void {
  store.delete(provider)
}

export function hasTokens(provider: string): boolean {
  return store.has(provider)
}

export function allProviders(): string[] {
  return Object.keys(store.store)
}
