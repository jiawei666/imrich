import type {
  Preset,
  RefreshStatus,
  StockKlineResponse,
  TechnicalCandidate,
  KlineTimeframe,
} from '@/types'

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

export const api = {
  presets: () => get<Preset[]>('/presets'),
  refreshStatus: () => get<RefreshStatus>('/refresh/status'),
  refreshKline: async () => {
    const r = await fetch(`${BASE}/refresh/kline`, { method: 'POST' })
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  },
  refreshFundamental: async () => {
    // 阶段1后端暂未实现，占位以保证按钮可点（阶段2接入）
    const r = await fetch(`${BASE}/refresh/fundamental`, { method: 'POST' })
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  },
  screenTechnical: (preset: string, params: Record<string, number> = {}) =>
    get<TechnicalCandidate[]>(
      `/screen?preset=${encodeURIComponent(preset)}&params=${encodeURIComponent(JSON.stringify(params))}`,
    ),
  stockKline: (code: string, period: KlineTimeframe) =>
    get<StockKlineResponse>(`/stock/${encodeURIComponent(code)}/kline?period=${period}`),
}
