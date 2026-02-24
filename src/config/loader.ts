import Conf from 'conf'
import { configSchema, type AppConfig } from './schema.js'
import { defaultConfig } from './defaults.js'

const store = new Conf<AppConfig>({
  projectName: 'adversarial-mirror',
  configName: 'config',
  defaults: defaultConfig
})

export function loadConfig(): AppConfig {
  return configSchema.parse(store.store)
}

export function saveConfig(next: AppConfig): void {
  store.store = configSchema.parse(next)
}

export function setConfigValue(path: string, value: unknown): AppConfig {
  const current = loadConfig()
  const updated = setByPath({ ...current }, path, value)
  saveConfig(updated)
  return updated
}

function setByPath(config: AppConfig, path: string, value: unknown): AppConfig {
  const keys = path.split('.').filter(Boolean)
  if (keys.length === 0) {
    return config
  }

  let cursor: any = config
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i]
    if (typeof cursor[key] !== 'object' || cursor[key] === null) {
      cursor[key] = {}
    }
    cursor = cursor[key]
  }

  cursor[keys[keys.length - 1]] = value
  return config
}
