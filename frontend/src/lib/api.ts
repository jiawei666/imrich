import type {
  Candidate,
  FundamentalScreenResultResponse,
  IndexInfo,
  MetaResponse,
  Preset,
  RefreshStatus,
  ScreenResultResponse,
  ScreenSnapshotMeta,
  StockDetail,
  StockKlineResponse,
  StockListResponse,
  StockSearchResponse,
  TechnicalCandidate,
  KlineTimeframe,
  WatchlistGroup,
  WatchlistItem,
} from '@/types'

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8311'

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

async function postJson<T>(path: string, body: unknown): Promise<T | undefined> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  if (r.status === 204) return undefined
  return r.json() as Promise<T>
}

async function patchJson<T>(path: string, body: unknown): Promise<T | undefined> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  if (r.status === 204) return undefined
  return r.json() as Promise<T>
}

async function deleteReq(path: string): Promise<void> {
  const r = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
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
  refreshKline: async () => {
    const r = await fetch(`${BASE}/refresh/kline`, { method: 'POST' })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      throw new Error(body.detail || `${r.status}`)
    }
    return r.json()
  },
  refreshStockList: async () => {
    const r = await fetch(`${BASE}/refresh/stock-list`, { method: 'POST' })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      throw new Error(body.detail || `${r.status}`)
    }
    return r.json()
  },
  refreshAll: async () => {
    const r = await fetch(`${BASE}/refresh/all`, { method: 'POST' })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      throw new Error(body.detail || `${r.status}`)
    }
    return r.json()
  },
  refreshFundamentalStep: async (step: string) => {
    const r = await fetch(`${BASE}/refresh/fundamental/${step}`, { method: 'POST' })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      throw new Error(body.detail || `${r.status}`)
    }
    return r.json()
  },
  screenFundamental: (preset: string, params: Record<string, unknown> = {}) =>
    get<Candidate[]>(
      `/screen?preset=${encodeURIComponent(preset)}&params=${encodeURIComponent(JSON.stringify(params))}`,
    ),
  screenFundamentalResult: (preset: string, params?: Record<string, number | string>) => {
    const qs = new URLSearchParams()
    qs.set('preset', preset)
    if (params) qs.set('params', JSON.stringify(params))
    return get<FundamentalScreenResultResponse>(`/screen/fundamental/result?${qs.toString()}`)
  },

  /** 获取可用宽基指数列表 */
  listIndices: () => get<IndexInfo[]>('/indices'),
  /** @deprecated 使用 screenResult() 替代 */
  screenTechnical: (preset: string, params: Record<string, number> = {}) =>
    get<TechnicalCandidate[]>(
      `/screen?preset=${encodeURIComponent(preset)}&params=${encodeURIComponent(JSON.stringify(params))}`,
    ),
  stockDetail: (code: string) => get<StockDetail>(`/stock/${encodeURIComponent(code)}`),
  stockKline: (code: string, period: KlineTimeframe) =>
    get<StockKlineResponse>(`/stock/${encodeURIComponent(code)}/kline?period=${period}`),
  /** @deprecated 使用 stocks() 替代 */
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
  /** @deprecated 使用 stocks() 替代 */
  searchStocks: (q: string, page = 1, pageSize = 30) =>
    get<StockSearchResponse>(
      `/stocks/search?q=${encodeURIComponent(q)}&page=${page}&page_size=${pageSize}`,
    ),
  screenHistory: (preset: string) =>
    get<ScreenSnapshotMeta[]>(`/screen/history?preset=${encodeURIComponent(preset)}`),
  /** @deprecated 使用 screenResult() 替代 */
  screenHistoryDetail: (preset: string, date: string) =>
    get<TechnicalCandidate[]>(`/screen/history/${date}?preset=${encodeURIComponent(preset)}`),

  /** 统一股票列表（全市场 + 搜索） */
  stocks: (params: { q?: string; page?: number; pageSize?: number; sortBy?: string; sortOrder?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.page) qs.set('page', String(params.page))
    if (params.pageSize) qs.set('page_size', String(params.pageSize))
    if (params.sortBy) qs.set('sort_by', params.sortBy)
    if (params.sortOrder) qs.set('sort_order', params.sortOrder)
    const q = qs.toString()
    return get<StockListResponse>(`/stocks${q ? `?${q}` : ''}`)
  },

  /** 统一筛选结果（运行筛选 + 历史快照） */
  screenResult: (params: { preset: string; params?: Record<string, number>; historyDate?: string }) => {
    const qs = new URLSearchParams()
    qs.set('preset', params.preset)
    if (params.params) qs.set('params', JSON.stringify(params.params))
    if (params.historyDate) qs.set('history_date', params.historyDate)
    return get<ScreenResultResponse>(`/screen/result?${qs.toString()}`)
  },

  watchlist: {
    groups: () => get<WatchlistGroup[]>('/watchlist/groups'),
    createGroup: (name: string) => postJson<WatchlistGroup>('/watchlist/groups', { name }),
    updateGroup: (id: number, body: { name?: string; sort_order?: number }) =>
      patchJson<WatchlistGroup>(`/watchlist/groups/${id}`, body),
    deleteGroup: (id: number) => deleteReq(`/watchlist/groups/${id}`),
    addItem: (body: { group_id: number; stock_code: string }) =>
      postJson<WatchlistItem>('/watchlist/items', body),
    removeItem: (id: number) => deleteReq(`/watchlist/items/${id}`),
    updateItem: (id: number, body: { group_id?: number; sort_order?: number }) =>
      patchJson<WatchlistItem>(`/watchlist/items/${id}`, body),
  },
}
