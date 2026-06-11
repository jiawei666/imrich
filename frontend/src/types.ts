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

export interface Candidate {
  code: string
  name: string
  industry: string
  score: number
  signals: SignalKey[]
  extraSignals: number // "+N" overflow count
  netProfitYoY: number
  revenueYoY: number
}

export interface QuarterPoint {
  quarter: string
  netProfit: number // 亿元
  revenue: number // 亿元
}

export interface Kline {
  date: string
  open: number
  close: number
  low: number
  high: number
}

export type KlineTimeframe = 'day' | 'week' | 'month' | 'quarter'

export interface ResearchReport {
  title: string
  org: string
  date: string
}

export interface RiskItem {
  label: string
  ok: boolean // true = pass / no risk
}

export interface RefreshTask {
  label: string
  done: number
  total: number
  elapsed: string
  status: 'done' | 'running'
  progress: number
}

export interface StockDetail {
  code: string
  name: string
  industry: string
  subIndustry: string
  score: number
  scoreDelta: number
  signals: SignalKey[]
  signalCount: number
  price: number
  drawdownFromHigh: number
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
  risks: RiskItem[]
}

export type StrategyId = 'super-growth' | 'oversold-bluechip'
