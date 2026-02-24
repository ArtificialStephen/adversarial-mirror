import { loadConfig } from '../../config/loader.js'

export function runConfig(): void {
  const config = loadConfig()
  process.stdout.write(JSON.stringify(config, null, 2))
  process.stdout.write('\n')
}
