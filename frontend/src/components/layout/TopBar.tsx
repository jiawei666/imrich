import { RotateCw } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Wordmark } from './Logo'
import type { StrategyId } from '@/types'

export function TopBar({
  strategy,
  onStrategyChange,
  updatedAt,
  onRefresh,
}: {
  strategy: StrategyId
  onStrategyChange: (s: StrategyId) => void
  updatedAt: string
  onRefresh: () => void
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-line bg-cream/80 px-6 backdrop-blur">
      <Wordmark className="h-9 w-auto" />

      <div className="ml-2 flex items-center gap-3">
        <span className="text-[13px] text-ink-faint">策略模式</span>
        <Tabs value={strategy} onValueChange={(v) => onStrategyChange(v as StrategyId)}>
          <TabsList>
            <TabsTrigger value="super-growth">创新高超级成长</TabsTrigger>
            <TabsTrigger value="oversold-bluechip">低位错杀蓝筹</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <span className="text-[13px] text-ink-soft">
          数据更新于 <span className="tnum">{updatedAt}</span>
        </span>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RotateCw className="size-3.5" />
          手动刷新
        </Button>
      </div>
    </header>
  )
}
