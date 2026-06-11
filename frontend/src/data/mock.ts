import type { Candidate, StockDetail, RefreshTask, Kline } from '@/types'

export const CANDIDATES: Candidate[] = [
  {
    code: '300750.SZ',
    name: '宁德时代',
    industry: '电力设备',
    score: 92.5,
    signals: ['highGrowth', 'orderFull', 'capexExpand', 'newProduct'],
    extraSignals: 4,
    netProfitYoY: 52.3,
    revenueYoY: 28.7,
  },
  {
    code: '688256.SH',
    name: '寒武纪-U',
    industry: '电子',
    score: 89.1,
    signals: ['beatExpect', 'domesticSub', 'highGrowth'],
    extraSignals: 3,
    netProfitYoY: 133.6,
    revenueYoY: 65.9,
  },
  {
    code: '002371.SZ',
    name: '北方华创',
    industry: '半导体',
    score: 85.4,
    signals: ['highGrowth', 'domesticSub', 'capexExpand'],
    extraSignals: 3,
    netProfitYoY: 48.1,
    revenueYoY: 36.2,
  },
  {
    code: '600519.SH',
    name: '贵州茅台',
    industry: '食品饮料',
    score: 78.7,
    signals: ['industryRecover', 'valuationRepair'],
    extraSignals: 2,
    netProfitYoY: 18.7,
    revenueYoY: 15.4,
  },
  {
    code: '300394.SZ',
    name: '天孚通信',
    industry: '通信',
    score: 75.2,
    signals: ['highGrowth', 'orderFull'],
    extraSignals: 2,
    netProfitYoY: 41.3,
    revenueYoY: 30.8,
  },
]

function genKline(count: number, intervalDays: number, startDate: string, startPrice = 180): Kline[] {
  const out: Kline[] = []
  let price = startPrice
  const start = new Date(startDate).getTime()
  for (let i = 0; i < count; i++) {
    const phase = i / count
    const trend = phase < 0.5 ? 0.6 * phase * 2 : phase < 0.8 ? 0.6 - 0.4 * ((phase - 0.5) / 0.3) : 0.2
    const wave = Math.sin(i / (count / 10)) * 10
    const vol = price * 0.018 * Math.sqrt(intervalDays)
    const drift = (trend * 0.6 + wave * 0.08) * (intervalDays / 5)
    const open = price
    const close = Math.max(open + drift + (Math.random() - 0.5) * vol, 1)
    const wick = vol * 0.5
    const high = Math.max(open, close) + Math.random() * wick
    const low = Math.max(Math.min(open, close) - Math.random() * wick, 0.01)
    const d = new Date(start + i * intervalDays * 86400000)
    out.push({
      date: d.toISOString().slice(0, 10),
      open: +open.toFixed(2),
      close: +close.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
    })
    price = close
  }
  return out
}

export const STOCK_DETAIL: StockDetail = {
  code: '300750.SZ',
  name: '宁德时代',
  industry: '电力设备',
  subIndustry: '锂电池',
  score: 92.5,
  scoreDelta: 2.1,
  signals: ['highGrowth', 'orderFull', 'capexExpand', 'newProduct'],
  signalCount: 4,
  price: 243.58,
  drawdownFromHigh: -18.7,
  yearHigh: 299.99,
  yearHighDate: '2025-05-20',
  quarters: [
    { quarter: '2023Q1', netProfit: 98, revenue: 890 },
    { quarter: '2023Q3', netProfit: 104, revenue: 1010 },
    { quarter: '2024Q1', netProfit: 105, revenue: 798 },
    { quarter: '2024Q3', netProfit: 131, revenue: 922 },
    { quarter: '2025Q1', netProfit: 139.6, revenue: 797.7 },
  ],
  latestNote:
    '2025Q1 净利润 139.6 亿元（同比 +52.3%）　营收 797.7 亿元（同比 +28.7%）',
  klineDay: genKline(250, 1, '2025-06-01', 180),
  klineWeek: genKline(104, 7, '2024-06-01', 155),
  klineMonth: genKline(36, 30, '2023-06-01', 120),
  klineQuarter: genKline(20, 90, '2021-06-01', 90),
  highLine: 299.99,
  reports: [
    {
      title: '宁德时代：Q1业绩超预期，全球份额持续提升',
      org: '中信证券',
      date: '2025-06-12',
    },
    {
      title: '动力电池需求高增，公司盈利能力稳步改善',
      org: '华泰证券',
      date: '2025-06-08',
    },
    {
      title: '海外储能订单饱满，盈利拐点确认',
      org: '国泰君安',
      date: '2025-06-05',
    },
  ],
  risks: [
    { label: '原材料价格大幅波动风险', ok: false },
    { label: '新能源汽车政策退坡风险', ok: true },
    { label: '市场竞争加剧风险', ok: false },
    { label: '海外贸易政策不确定性', ok: true },
    { label: '技术迭代不及预期风险', ok: true },
  ],
}

export const REFRESH_TASKS: RefreshTask[] = [
  { label: '股票列表', done: 2500, total: 2500, elapsed: '00:18', status: 'done', progress: 100 },
  { label: '财报数据', done: 2500, total: 2500, elapsed: '01:24', status: 'done', progress: 100 },
  { label: '行情数据', done: 2500, total: 2500, elapsed: '00:22', status: 'done', progress: 100 },
  { label: '研报爬取', done: 2486, total: 2500, elapsed: '02:36', status: 'running', progress: 98 },
]
