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
}

/** The 8 research-report keywords the author lists, as toggle filters. */
export const KEYWORDS = [
  '高增长',
  '业绩超预期',
  '订单饱满',
  '产能扩张',
  '新产品',
  '国产替代',
  '行业复苏',
  '估值修复',
] as const
