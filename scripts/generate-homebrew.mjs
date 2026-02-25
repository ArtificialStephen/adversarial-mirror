import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const tag = process.argv[2]
if (!tag) {
  console.error('Usage: node scripts/generate-homebrew.mjs <tag>')
  process.exit(1)
}

const token = process.env.GITHUB_TOKEN
if (!token) {
  console.error('GITHUB_TOKEN is required to fetch release assets from the GitHub API.')
  process.exit(1)
}

const repo =
  process.env.GITHUB_REPOSITORY ?? 'ArtificialStephen/adversarial-mirror'

const release = await fetchJson(
  `https://api.github.com/repos/${repo}/releases/tags/${tag}`,
  token
)

const assets = release.assets ?? []

const macosX64 = findAsset(assets, 'macos-x64')
const macosArm = findAsset(assets, 'macos-arm64')
const linuxX64 = findAsset(assets, 'linux-x64')
const linuxArm = findAsset(assets, 'linux-arm64')

if (!macosX64 || !macosArm) {
  throw new Error(
    'Missing macOS assets in release. Expected macos-x64 and macos-arm64.'
  )
}

const macosX64Sha = await fetchSha(macosX64.url, token)
const macosArmSha = await fetchSha(macosArm.url, token)

let linuxX64Sha = ''
let linuxArmSha = ''
if (linuxX64) {
  linuxX64Sha = await fetchSha(linuxX64.url, token)
}
if (linuxArm) {
  linuxArmSha = await fetchSha(linuxArm.url, token)
}

const version = tag.startsWith('v') ? tag.slice(1) : tag

const linuxBlock =
  linuxX64 && linuxArm
    ? `on_linux do
    if Hardware::CPU.intel?
      url "${linuxX64.browser_download_url}"
      sha256 "${linuxX64Sha}"
    else
      url "${linuxArm.browser_download_url}"
      sha256 "${linuxArmSha}"
    end
  end

  `
    : ''

const formula = `class AdversarialMirror < Formula
  desc "CLI middleware that mirrors prompts to an adversarial challenger"
  homepage "https://github.com/${repo}"
  version "${version}"

  on_macos do
    if Hardware::CPU.intel?
      url "${macosX64.browser_download_url}"
      sha256 "${macosX64Sha}"
    else
      url "${macosArm.browser_download_url}"
      sha256 "${macosArmSha}"
    end
  end

  ${linuxBlock}def install
    if OS.mac?
      if Hardware::CPU.intel?
        bin.install "${macosX64.name}" => "mirror"
      else
        bin.install "${macosArm.name}" => "mirror"
      end
    else
      if Hardware::CPU.intel?
        bin.install "${linuxX64?.name ?? 'adversarial-mirror-linux-x64'}" => "mirror"
      else
        bin.install "${linuxArm?.name ?? 'adversarial-mirror-linux-arm64'}" => "mirror"
      end
    end
  end
end
`

await writeFile('homebrew/adversarial-mirror.rb', formula)
console.log('Wrote homebrew/adversarial-mirror.rb')

function findAsset(assets, tokenFragment) {
  return assets.find((asset) => asset.name.includes(tokenFragment))
}

async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'adversarial-mirror-generator'
    }
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`)
  }
  return res.json()
}

async function fetchSha(assetUrl, token) {
  const res = await fetch(assetUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/octet-stream',
      'User-Agent': 'adversarial-mirror-generator'
    }
  })
  if (!res.ok) {
    throw new Error(`Failed to download asset: ${res.status}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const hash = createHash('sha256')
  hash.update(buffer)
  return hash.digest('hex')
}
