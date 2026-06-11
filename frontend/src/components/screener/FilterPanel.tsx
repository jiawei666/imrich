import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { NumberField, RadioPills } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KEYWORDS } from '@/data/signals'
import type { StrategyId } from '@/types'

export interface FilterState {
  netProfitYoY: number
  revenueYoY: number
  priceFromHigh: number
  keywordWindow: string
  sectorThreshold: number
  keywords: Record<string, boolean>
  pool: string
  industry: string
}

const POOLS = [
  { label: '全部A股', value: 'all' },
  { label: '沪深300', value: 'hs300' },
  { label: '中证500', value: 'zz500' },
  { label: '中证1000', value: 'zz1000' },
]

export function FilterPanel({
  strategy,
  state,
  onChange,
  onApply,
  onReset,
}: {
  strategy: StrategyId
  state: FilterState
  onChange: (next: FilterState) => void
  onApply: () => void
  onReset: () => void
}) {
  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...state, [key]: value })

  const isOversold = strategy === 'oversold-bluechip'

  return (
    <Card>
      <CardHeader>
        <CardTitle>筛选条件</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* numeric thresholds */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          <NumberField
            label="净利润同比下限"
            op="≥"
            unit="%"
            value={state.netProfitYoY}
            onChange={(v) => set('netProfitYoY', v)}
          />
          <NumberField
            label="营收同比下限"
            op="≥"
            unit="%"
            value={state.revenueYoY}
            onChange={(v) => set('revenueYoY', v)}
          />
          <NumberField
            label={isOversold ? '距高点回撤下限' : '股价距一年高点'}
            op={isOversold ? '≥' : '≤'}
            unit="%"
            value={state.priceFromHigh}
            onChange={(v) => set('priceFromHigh', v)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-ink-soft">研报关键词时间窗</label>
            <Select
              value={state.keywordWindow}
              onValueChange={(v) => set('keywordWindow', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">近 30 天</SelectItem>
                <SelectItem value="60">近 60 天</SelectItem>
                <SelectItem value="90">近 90 天</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumberField
            label="板块效应阈值"
            op="≥"
            unit="分"
            value={state.sectorThreshold}
            onChange={(v) => set('sectorThreshold', v)}
          />
        </div>

        {/* keyword toggles */}
        <div className="space-y-2.5">
          <div className="text-xs text-ink-soft">
            研报关键词<span className="ml-1 text-ink-faint">（命中越多得分越高）</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {KEYWORDS.map((kw) => (
              <label
                key={kw}
                className="flex cursor-pointer items-center gap-2 text-sm text-ink"
              >
                <Switch
                  checked={state.keywords[kw] ?? true}
                  onCheckedChange={(c) =>
                    set('keywords', { ...state.keywords, [kw]: c })
                  }
                />
                {kw}
              </label>
            ))}
          </div>
        </div>

        {/* pool + industry */}
        <div className="flex flex-col gap-4 border-t border-line-soft pt-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2.5">
            <div className="text-xs text-ink-soft">股票池过滤</div>
            <RadioPills
              options={POOLS}
              value={state.pool}
              onChange={(v) => set('pool', v)}
            />
          </div>

          <div className="flex flex-col gap-1.5 lg:w-48">
            <label className="text-xs text-ink-soft">行业过滤</label>
            <Select value={state.industry} onValueChange={(v) => set('industry', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部行业</SelectItem>
                <SelectItem value="power">电力设备</SelectItem>
                <SelectItem value="semi">半导体</SelectItem>
                <SelectItem value="elec">电子</SelectItem>
                <SelectItem value="comm">通信</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2.5">
            <Button variant="subtle" onClick={onReset}>
              重置
            </Button>
            <Button variant="primary" onClick={onApply}>
              应用筛选
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
