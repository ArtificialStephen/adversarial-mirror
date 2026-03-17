const CA_BASE = 'https://cloudcode-pa.googleapis.com/v1internal'

const CLIENT_METADATA = {
  ideType: 'GEMINI_CLI',
  platform: 'WINDOWS_AMD64',
  pluginType: 'GEMINI',
  pluginVersion: '0.1.0',
}

/**
 * Resolves the Google Cloud project ID for Gemini OAuth.
 * Calls loadCodeAssist; if no project is returned, runs onboardUser (free tier).
 * This mirrors what gemini-cli does during first-time setup.
 */
export async function resolveGeminiProject(accessToken: string): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  // Step 1: load existing project
  const loadRes = await fetch(`${CA_BASE}:loadCodeAssist`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ metadata: CLIENT_METADATA }),
  })

  if (!loadRes.ok) {
    const body = await loadRes.text()
    throw new Error(`loadCodeAssist failed (${loadRes.status}): ${body.slice(0, 300)}`)
  }

  const loaded = await loadRes.json() as { cloudaicompanionProject?: string | null }
  if (loaded.cloudaicompanionProject) {
    return loaded.cloudaicompanionProject
  }

  // Step 2: first-time user — onboard with free tier (no project, Google manages it)
  process.stdout.write('Setting up Gemini project (first-time setup)...\n')
  const onboardRes = await fetch(`${CA_BASE}:onboardUser`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tierId: 'FREE',
      cloudaicompanionProject: undefined,
      metadata: CLIENT_METADATA,
    }),
  })

  if (!onboardRes.ok) {
    const body = await onboardRes.text()
    throw new Error(`onboardUser failed (${onboardRes.status}): ${body.slice(0, 300)}`)
  }

  const lro = await onboardRes.json() as {
    name?: string
    done?: boolean
    response?: { cloudaicompanionProject?: { id?: string } }
  }

  if (lro.done && lro.response?.cloudaicompanionProject?.id) {
    return lro.response.cloudaicompanionProject.id
  }

  if (!lro.name) {
    throw new Error('onboardUser returned no operation name')
  }

  // Step 3: poll the LRO until done
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const pollRes = await fetch(`${CA_BASE}/${lro.name}`, { headers })
    if (!pollRes.ok) continue
    const poll = await pollRes.json() as typeof lro
    if (poll.done) {
      const projectId = poll.response?.cloudaicompanionProject?.id
      if (!projectId) throw new Error('Onboarding completed but no project ID returned')
      return projectId
    }
  }

  throw new Error('Gemini onboarding timed out. Try running mirror auth login gemini again.')
}
