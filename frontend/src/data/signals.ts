import type { SignalKey } from '@/types'

/** Display label + badge tone for every signal. */
export const SIGNAL_META: Record<
  SignalKey,
  { label: string; tone: 'brand' | 'ink' | 'neutral' }
> = {
  highGrowth: { label: '高增长', tone: 'brand' },
  newHigh: { label: '创新高', tone: 'brand' },
  beatExpect: { label: '业绩超预期', tone: 'ink' },
  sectorEffect: { label: '板块效应', tone: 'ink' },
  industryNewHigh: { label: '行业新高', tone: 'ink' },
  alpha: { label: 'α地位', tone: 'brand' },
  orderFull: { label: '订单饱满', tone: 'neutral' },
  capexExpand: { label: '产能扩张', tone: 'neutral' },
  newProduct: { label: '新产品', tone: 'neutral' },
  domesticSub: { label: '国产替代', tone: 'neutral' },
  industryRecover: { label: '行业复苏', tone: 'neutral' },
  valuationRepair: { label: '估值修复', tone: 'neutral' },
  oversold: { label: '低位超跌', tone: 'neutral' },
  oversoldBluechipA: { label: '错杀·普通超跌', tone: 'neutral' },
  oversoldBluechipB: { label: '错杀·深度超跌', tone: 'ink' },
}

// 研报关键词信号已由后端 _display_signals 统一返回在 signals[] 中
