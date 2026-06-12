import type {
  Candidate,
  MetaResponse,
  Preset,
  RefreshStatus,
  StockDetail,
  StockKlineResponse,
  StockListResponse,
  StockSearchItem,
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
  meta: () => get<MetaResponse>('/meta'),
  refreshStatus: () => get<RefreshStatus>('/refresh/status'),
  refreshStatusStream: (onMessage: (status: RefreshStatus) => void) => {
    const es = new EventSource(`${BASE}/refresh/status/stream`)
    es.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data) as RefreshStatus) } catch { /* ignore parse errors */ }
    }
    return () => es.close()
  },
  refreshKline: async (reloadStockList = true) => {
    const r = await fetch(`${BASE}/refresh/kline?reload_stock_list=${reloadStockList}`, { method: 'POST' })
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  },
  refreshFundamental: async () => {
    const r = await fetch(`${BASE}/refresh/fundamental`, { method: 'POST' })
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json()
  },
  screenFundamental: (preset: string, params: Record<string, unknown> = {}) =>
    get<Candidate[]>(
      `/screen?preset=${encodeURIComponent(preset)}&params=${encodeURIComponent(JSON.stringify(params))}`,
    ),
  screenTechnical: (preset: string, params: Record<string, number> = {}) =>
    get<TechnicalCandidate[]>(
      `/screen?preset=${encodeURIComponent(preset)}&params=${encodeURIComponent(JSON.stringify(params))}`,
    ),
  stockDetail: (code: string) => get<StockDetail>(`/stock/${encodeURIComponent(code)}`),
  stockKline: (code: string, period: KlineTimeframe) =>
    get<StockKlineResponse>(`/stock/${encodeURIComponent(code)}/kline?period=${period}`),
  stockList: (params: {
    page?: number
    pageSize?: number
    sortBy?: string
    sortOrder?: string
  } = {}) => {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page))
    if (params.pageSize) qs.set('page_size', String(params.pageSize))
    if (params.sortBy) qs.set('sort_by', params.sortBy)
    if (params.sortOrder) qs.set('sort_order', params.sortOrder)
    const q = qs.toString()
    return get<StockListResponse>(`/stocks${q ? `?${q}` : ''}`)
  },
  searchStocks: (q: string) =>
    get<{ data: StockSearchItem[] }>(`/stocks/search?q=${encodeURIComponent(q)}`),
}
