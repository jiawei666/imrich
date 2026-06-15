/** Signal a stock can hit, derived faithfully from the author's criteria. */
export type SignalKey =
  | 'highGrowth' // 业绩大增
  | 'newHigh' // 创新高
  | 'beatExpect' // 超预期
  | 'sectorEffect' // 板块效应
  | 'industryNewHigh' // 行业指数新高
  | 'alpha' // α地位
  | 'orderFull' // 订单饱满
  | 'capexExpand' // 产能扩张
  | 'newProduct' // 新产品
  | 'domesticSub' // 国产替代
  | 'industryRecover' // 行业复苏
  | 'valuationRepair' // 估值修复
  | 'oversold' // 低位超跌
  | 'oversoldBluechipA' // 错杀·普通超跌
  | 'oversoldBluechipB' // 错杀·深度超跌

export interface Candidate {
  code: string
  name: string
  industry: string
  score: number
  signals: SignalKey[]
  netProfitYoY: number
  revenueYoY: number
  risks: RiskItem[]
  drawdownFromHigh: number
}

export interface QuarterPoint {
  quarter: string
  netProfit: number // 亿元（累计）
  revenue: number // 亿元（累计）
  netProfitQuarterly: number | null // 亿元（单季度）
  revenueQuarterly: number | null // 亿元（单季度）
}

export interface Kline {
  date: string
  open: number
  close: number
  low: number
  high: number
  volume?: number | null
  k?: number | null
  d?: number | null
  j?: number | null
  whiteLine?: number | null
  yellowLine?: number | null
}

export type KlineTimeframe = 'day' | 'week' | 'month' | 'quarter'

export interface ResearchReport {
  title: string
  org: string
  date: string
  pdfUrl?: string | null
}

export interface RiskItem {
  label: string
  ok: boolean // true = pass / no risk
}

export interface StockDetail {
  code: string
  name: string
  industry: string
  subIndustry: string
  price: number
  yearHigh: number
  yearHighDate: string
  quarters: QuarterPoint[]
  latestNote: string
  klineDay: Kline[]
  klineWeek: Kline[]
  klineMonth: Kline[]
  klineQuarter: Kline[]
  highLine: number
  reports: ResearchReport[]
}

export type StrategyId =
  | 'super-growth'
  | 'oversold-bluechip'
  | 'trend-support'
  | 'b2'

export const STRATEGY_CATEGORY: Record<StrategyId, 'fundamental' | 'technical'> = {
  'super-growth': 'fundamental',
  'oversold-bluechip': 'fundamental',
  'trend-support': 'technical',
  'b2': 'technical',
}

export interface TechnicalCandidate {
  code: string
  name: string
  industry: string
  close: number
  pctChg: number
  strategyName: string
  triggerDate: string
  diagnostics: Record<string, number>
  sortKey: string
}

export interface PresetParam {
  key: string
  label: string
  type?: 'number' | 'select'
  value: number | string
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: { value: string; label: string; group?: string }[]
}

export interface Preset {
  id: StrategyId
  category: 'fundamental' | 'technical'
  name: string
  params: PresetParam[]
  warning?: string
}

export interface RefreshStep {
  label: string
  status: 'idle' | 'running' | 'done' | 'error'
  error: string | null
  done: number
  total: number
  elapsed: string
  progress: number
}

export interface RefreshGroup {
  status: 'idle' | 'running' | 'done' | 'error'
  updatedAt: string | null
  error: string | null
  steps: RefreshStep[]
}

export interface RefreshStatus {
  kline: RefreshGroup
  fundamental: RefreshGroup
  all: RefreshGroup
}


export interface StockKlineResponse {
  data: Kline[]
  highLine: number
  highLabel: string
}

export interface MetaResponse {
  stockList: { updatedAt: string | null }
  klineDay: { updatedAt: string | null }
  financialReports: { updatedAt: string | null; reportPeriod: string | null }
  forecasts: { updatedAt: string | null }
  industryIndex: { updatedAt: string | null }
  researchReports: { stage1UpdatedAt: string | null; stage2UpdatedAt: string | null; stage2CandidateCount: number }
}

export interface StockListItem {
  code: string
  name: string
  market_cap: number | null
  industry: string | null
  is_st: boolean
  is_bj: boolean
  listed_at: string | null
  updated_at: string | null
  close: number | null
  pct_chg: number | null
}

export interface StockListResponse {
  total: number
  page: number
  pageSize: number
  data: StockListItem[]
}

export type StockSortField = 'code' | 'name' | 'market_cap'
export type SortOrder = 'asc' | 'desc'

export interface StockSearchItem {
  code: string
  name: string
  close: number | null
  pct_chg: number | null
}

export interface StockSearchResponse {
  total: number
  page: number
  pageSize: number
  data: StockSearchItem[]
}

export interface ScreenSnapshotMeta {
  date: string
  count: number
  updatedAt: string
}

/** 统一的股票行数据，全市场/搜索/筛选结果共用 */
export interface StockRow {
  code: string
  name: string
  industry: string | null
  parent_industry?: string | null
  market_cap: number | null
  close: number | null
  pct_chg: number | null
  diagnostics?: Record<string, number>
  sort_key?: string
  trigger_date?: string
}

/** /screen/result 接口响应 */
export interface ScreenResultResponse {
  items: StockRow[]
  total: number
}

/** /screen/fundamental/result 接口响应 */
export interface FundamentalScreenResultResponse {
  items: Candidate[]
  total: number
  updatedAt: string | null
}

/** 宽基指数信息 */
export interface IndexInfo {
  indexCode: string
  indexName: string
  stockCodes: string[]
}
