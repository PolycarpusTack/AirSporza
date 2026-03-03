import type { ImportSource } from '@prisma/client'
import { ApiFootballAdapter } from './ApiFootballAdapter.js'
import { FootballDataAdapter } from './FootballDataAdapter.js'
import { TheSportsDbAdapter } from './TheSportsDbAdapter.js'
import type { ImportAdapter } from './BaseAdapter.js'
import { getSourceCapabilities } from '../capabilities.js'
import type { SourceCode } from '../types.js'

type SourceRuntimeStatus = {
  capabilities: ReturnType<typeof getSourceCapabilities>
  configStatus: {
    status: 'ready' | 'missing_config' | 'no_adapter'
    hasCredentials: boolean
    canExecute: boolean
    missingConfig: string[]
  }
}

function getConfigValue(config: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = config[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

export function getImportSourceRuntimeStatus(
  source: {
    code: SourceCode
    configJson: unknown
    kind: 'api' | 'file'
  }
): SourceRuntimeStatus {
  const config = (source.configJson ?? {}) as Record<string, unknown>
  const capabilities = getSourceCapabilities(source.code as SourceCode)
  const missingConfig: string[] = []

  if (capabilities.hasAdapter) {
    switch (source.code) {
      case 'football_data': {
        if (!getConfigValue(config, 'api_key', 'apiKey')) {
          missingConfig.push('api_key')
        }
        break
      }
      case 'api_football': {
        if (!getConfigValue(config, 'api_key', 'apiKey')) {
          missingConfig.push('api_key')
        }
        break
      }
      case 'the_sports_db':
        break
      case 'statsbomb_open': {
        if (!getConfigValue(config, 'data_path', 'dataPath')) {
          missingConfig.push('data_path')
        }
        break
      }
    }
  }

  const hasCredentials = source.kind === 'file'
    ? Boolean(getConfigValue(config, 'data_path', 'dataPath'))
    : source.code === 'the_sports_db'
      ? true
      : Boolean(getConfigValue(config, 'api_key', 'apiKey'))

  const status = !capabilities.hasAdapter
    ? 'no_adapter'
    : missingConfig.length > 0
      ? 'missing_config'
      : 'ready'

  return {
    capabilities,
    configStatus: {
      status,
      hasCredentials,
      canExecute: capabilities.hasAdapter && missingConfig.length === 0,
      missingConfig,
    }
  }
}

export function createImportAdapter(source: Pick<ImportSource, 'code' | 'configJson'>): ImportAdapter {
  const config = (source.configJson ?? {}) as Record<string, unknown>
  const runtime = getImportSourceRuntimeStatus({
    code: source.code as SourceCode,
    configJson: source.configJson,
    kind: 'api',
  })

  if (!runtime.configStatus.canExecute) {
    if (runtime.configStatus.status === 'no_adapter') {
      throw new Error(`Source adapter for '${source.code}' is not implemented yet.`)
    }

    throw new Error(
      `Source '${source.code}' is missing required configuration: ${runtime.configStatus.missingConfig.join(', ')}.`
    )
  }

  switch (source.code) {
    case 'football_data':
      return new FootballDataAdapter({
        apiKey: getConfigValue(config, 'api_key', 'apiKey'),
        baseUrl: String(config.base_url || config.baseUrl || 'https://api.football-data.org/v4'),
      })
    case 'api_football':
      return new ApiFootballAdapter({
        apiKey: getConfigValue(config, 'api_key', 'apiKey'),
        baseUrl: String(config.base_url || config.baseUrl || 'https://api-football-v1.p.rapidapi.com/v3'),
        host: String(config.host || config.rapidapi_host || 'api-football-v1.p.rapidapi.com'),
      })
    case 'the_sports_db':
      return new TheSportsDbAdapter({
        apiKey: getConfigValue(config, 'api_key', 'apiKey') || '123',
        baseUrl: String(config.base_url || config.baseUrl || 'https://www.thesportsdb.com/api/v1/json'),
      })
    default:
      throw new Error(`Source adapter for '${source.code}' is not implemented yet.`)
  }
}
