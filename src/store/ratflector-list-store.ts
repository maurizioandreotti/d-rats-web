import { create } from 'zustand'

export interface RatflectorServer {
  name: string
  description: string
  hostname: string
  port: number
  active: boolean
}

interface RatflectorListState {
  servers: RatflectorServer[]
  loading: boolean
  error: string | null
  fetchServers: () => Promise<void>
}

const YAML_URLS = [
  'https://raw.githubusercontent.com/ham-radio-software/ratflectors/main/ratflectors.yml',
  'https://cdn.jsdelivr.net/gh/ham-radio-software/ratflectors/ratflectors.yml',
]

function stripQuotes(s: string): string {
  if (s.length >= 2 && ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"')))) {
    return s.slice(1, -1)
  }
  return s
}

function parseYamlServers(text: string): RatflectorServer[] {
  const servers: RatflectorServer[] = []
  const lines = text.split('\n')
  let inList = false
  let current: Partial<RatflectorServer> | null = null

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (line.startsWith('ratflectors:')) {
      inList = true
      continue
    }
    if (!inList) continue

    if (line.startsWith('  - ')) {
      if (current && current.name) {
        servers.push(current as RatflectorServer)
      }
      current = {}
      const kv = line.substring(4).trim()
      const colonIdx = kv.indexOf(':')
      if (colonIdx > 0) {
        const key = kv.substring(0, colonIdx).trim()
        let val: string | boolean = stripQuotes(kv.substring(colonIdx + 1).trim())
        if (val === 'true') val = true
        else if (val === 'false') val = false
        if (key === 'name') current.name = val as string
        else if (key === 'description') current.description = val as string
        else if (key === 'hostname') current.hostname = val as string
        else if (key === 'port') current.port = Number(val)
        else if (key === 'active') current.active = val as boolean
      }
      continue
    }

    if (current && line.startsWith('    ')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx > 0) {
        const key = line.substring(4, colonIdx).trim()
        let val: string | boolean = stripQuotes(line.substring(colonIdx + 1).trim())
        if (val === 'true') val = true
        else if (val === 'false') val = false
        if (key === 'name') current.name = val as string
        else if (key === 'description') current.description = val as string
        else if (key === 'hostname') current.hostname = val as string
        else if (key === 'port') current.port = Number(val)
        else if (key === 'active') current.active = val as boolean
      }
    }
  }

  if (current && current.name) {
    servers.push(current as RatflectorServer)
  }

  return servers.filter(s => s.active !== false)
}

async function fetchWithFallback(urls: string[]): Promise<string> {
  let lastErr: Error | null = null
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`)
      return await resp.text()
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error('Unknown error')
    }
  }
  throw lastErr ?? new Error('All URLs failed')
}

export const useRatflectorListStore = create<RatflectorListState>()((set) => ({
  servers: [],
  loading: false,
  error: null,
  fetchServers: async () => {
    set({ loading: true, error: null })
    try {
      const text = await fetchWithFallback(YAML_URLS)
      const servers = parseYamlServers(text)
      set({ servers, loading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch'
      set({ error: msg, loading: false })
    }
  },
}))
